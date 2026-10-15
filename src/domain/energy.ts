import type { ActivityLevel, Goal, Macros, Profile, Sex } from "./types.ts";

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };
const KCAL_PER_KG = 7700;
const MAX_DEFICIT_RATIO = 0.25;
/** Weight gain: surplus stays modest so most of it is not fat. */
const MAX_SURPLUS_RATIO: Record<"gain" | "muscle", number> = {
  gain: 0.2,
  muscle: 0.12,
};
/** At or above this BMI, adding weight isn't advised. */
export const GAIN_BMI_LIMIT = 25;

export const GOALS: { id: Goal; emoji: string; title: string; sub: string }[] =
  [
    {
      id: "lose",
      emoji: "🔥",
      title: "Lose weight",
      sub: "A gentle calorie deficit with high protein",
    },
    {
      id: "maintain",
      emoji: "⚖️",
      title: "Stay healthy",
      sub: "Keep my weight and eat well",
    },
    {
      id: "gain",
      emoji: "🍚",
      title: "Gain weight",
      sub: "For a healthy weight when underweight",
    },
    {
      id: "muscle",
      emoji: "💪",
      title: "Build muscle",
      sub: "Lean gain with extra protein, for gym goers",
    },
  ];

/** Older saved profiles predate goals: they were all weight-loss plans. */
export function normalizeProfile(raw: Profile): Profile {
  const p: Partial<Profile> = raw;
  return {
    ...raw,
    goal: p.goal ?? "lose",
    weeklyGainKg: typeof p.weeklyGainKg === "number" ? p.weeklyGainKg : 0.25,
  };
}

/** Lowest healthy weight for a height (BMI 18.5), rounded up to a whole kg. */
export function minHealthyWeightKg(heightCm: number): number {
  return Math.ceil(18.5 * (heightCm / 100) ** 2);
}

/** Highest weight that is still under BMI 25, rounded down to a whole kg. */
export function maxGainWeightKg(heightCm: number): number {
  return Math.floor((GAIN_BMI_LIMIT - 0.1) * (heightCm / 100) ** 2);
}

/** Mifflin-St Jeor. */
export function bmr(
  p: Pick<Profile, "sex" | "weightKg" | "heightCm" | "age">,
): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === "male" ? base + 5 : base - 161;
}

export function tdee(p: Profile): number {
  return bmr(p) * ACTIVITY_FACTOR[p.activity];
}

export type CalorieTarget = {
  kcal: number;
  tdee: number;
  /** kcal/day below maintenance (weight loss), else 0. */
  deficit: number;
  /** kcal/day above maintenance (gain or muscle), else 0. */
  surplus: number;
  clampedToFloor: boolean;
  /** Eating at maintenance because the goal is "stay healthy" or the target weight is reached. */
  atGoal: boolean;
  /** Wanted to add weight, but BMI is already high, so we hold at maintenance. */
  gainBlocked: boolean;
};

export function calorieTarget(p: Profile): CalorieTarget {
  const goal = p.goal ?? "lose";
  const maintenance = tdee(p);
  const floor = MIN_KCAL[p.sex];
  const base = {
    tdee: Math.round(maintenance),
    deficit: 0,
    surplus: 0,
    clampedToFloor: false,
    atGoal: false,
    gainBlocked: false,
  };
  const holdAtMaintenance = (
    extra: Partial<CalorieTarget> = {},
  ): CalorieTarget => ({
    ...base,
    kcal: Math.round(Math.max(maintenance, floor)),
    atGoal: true,
    ...extra,
  });

  if (goal === "maintain") return holdAtMaintenance();

  if (goal === "gain" || goal === "muscle") {
    const bmi = p.weightKg / (p.heightCm / 100) ** 2;
    if (bmi >= GAIN_BMI_LIMIT)
      return holdAtMaintenance({ atGoal: false, gainBlocked: true });
    if (p.weightKg >= p.targetWeightKg) return holdAtMaintenance();
    const wanted = ((p.weeklyGainKg ?? 0.25) * KCAL_PER_KG) / 7;
    const surplus = Math.min(wanted, maintenance * MAX_SURPLUS_RATIO[goal]);
    const kcal = Math.round(maintenance + surplus);
    return { ...base, kcal, surplus: kcal - Math.round(maintenance) };
  }

  if (p.weightKg <= p.targetWeightKg) return holdAtMaintenance();
  const wanted = (p.weeklyLossKg * KCAL_PER_KG) / 7;
  const deficit = Math.min(wanted, maintenance * MAX_DEFICIT_RATIO);
  const raw = maintenance - deficit;
  const kcal = Math.round(Math.max(raw, floor));
  return {
    ...base,
    kcal,
    deficit: Math.round(maintenance - kcal),
    clampedToFloor: raw < floor,
  };
}

const PROTEIN_PER_KG: Record<Goal, number> = {
  lose: 1.2,
  maintain: 1,
  gain: 1.6,
  muscle: 1.8,
};
const FAT_SHARE: Record<Goal, number> = {
  lose: 0.28,
  maintain: 0.28,
  gain: 0.25,
  muscle: 0.25,
};

/** Protein by goal (capped at 30% of kcal, 35% when building), fat 25–28% of kcal, carbs = remainder, fiber 14 g / 1000 kcal (min 25 g). */
export function macroTargets(p: Profile, kcal: number): Macros {
  const goal = p.goal ?? "lose";
  const cap = goal === "gain" || goal === "muscle" ? 0.35 : 0.3;
  const protein = Math.min(PROTEIN_PER_KG[goal] * p.weightKg, (kcal * cap) / 4);
  const fat = (kcal * FAT_SHARE[goal]) / 9;
  const carbs = (kcal - protein * 4 - fat * 9) / 4;
  const fiber = Math.max(25, (kcal / 1000) * 14);
  return {
    kcal,
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    fiber: Math.round(fiber),
  };
}
