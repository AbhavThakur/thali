import type { ActivityLevel, Macros, Profile, Sex } from "./types.ts";

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };
const KCAL_PER_KG_FAT = 7700;
const MAX_DEFICIT_RATIO = 0.25;

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
  deficit: number;
  clampedToFloor: boolean;
};

export function calorieTarget(p: Profile): CalorieTarget {
  const maintenance = tdee(p);
  const wanted = (p.weeklyLossKg * KCAL_PER_KG_FAT) / 7;
  const deficit = Math.min(wanted, maintenance * MAX_DEFICIT_RATIO);
  const floor = MIN_KCAL[p.sex];
  const raw = maintenance - deficit;
  const kcal = Math.round(Math.max(raw, floor));
  return {
    kcal,
    tdee: Math.round(maintenance),
    deficit: Math.round(maintenance - kcal),
    clampedToFloor: raw < floor,
  };
}

/** Protein 1.2 g/kg (max 30% kcal), fat 28% kcal, carbs = remainder, fiber 14 g / 1000 kcal (min 25 g). */
export function macroTargets(p: Profile, kcal: number): Macros {
  const protein = Math.min(1.2 * p.weightKg, (kcal * 0.3) / 4);
  const fat = (kcal * 0.28) / 9;
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
