import { maxGainWeightKg, minHealthyWeightKg } from "./energy.ts";
import type { Goal } from "./types.ts";

export type BmiCategory = "underweight" | "healthy" | "overweight" | "obese";

export type TargetOption = { kg: number; label: string; note: string };

export type WeightGuide = {
  bmi: number;
  category: BmiCategory;
  healthyMinKg: number;
  healthyMaxKg: number;
  message: string;
  options: TargetOption[];
};

// Asia-Pacific / Indian consensus cut-offs: health risks rise at a lower BMI for South Asians.
const OVERWEIGHT = 23;
const OBESE = 25;

const MESSAGES: Record<BmiCategory, string> = {
  underweight:
    "Your weight is below the healthy range for your height. Losing weight isn't recommended. Please talk to a doctor about it.",
  healthy:
    "You're already in the healthy range for your height. You can trim a little, or set your current weight to simply maintain it.",
  overweight:
    "You're a little above the healthy range. Losing even 5% of your weight helps blood sugar, blood pressure and energy.",
  obese:
    "You're above the healthy range for your height. Start with a 5–10% goal; it brings real health benefits. Check with a doctor if you have diabetes or high BP.",
};

export function bmiOf(heightCm: number, weightKg: number): number {
  return weightKg / (heightCm / 100) ** 2;
}

export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return "underweight";
  if (bmi < OVERWEIGHT) return "healthy";
  if (bmi < OBESE) return "overweight";
  return "obese";
}

/** BMI-based advice plus 0–3 suggested targets, each below current weight and never under BMI 18.5. */
export function weightGuide(heightCm: number, weightKg: number): WeightGuide {
  const bmi = bmiOf(heightCm, weightKg);
  const category = bmiCategory(bmi);
  const healthyMinKg = minHealthyWeightKg(heightCm);
  const healthyMaxKg = Math.floor((OVERWEIGHT - 0.1) * (heightCm / 100) ** 2);

  const candidates: TargetOption[] =
    category === "underweight"
      ? []
      : [
          {
            kg: Math.round(weightKg * 0.95),
            label: "First milestone",
            note: "Lose 5%: very doable, real health benefits",
          },
          {
            kg: Math.round(weightKg * 0.9),
            label: "Steady goal",
            note: "Lose 10%: a big, lasting change",
          },
          {
            kg: healthyMaxKg,
            label: "Healthy weight",
            note: "Top of the healthy range for your height",
          },
        ];

  const seen = new Set<number>();
  const options = candidates.filter((o) => {
    const ok = o.kg < weightKg && o.kg >= healthyMinKg && !seen.has(o.kg);
    seen.add(o.kg);
    return ok;
  });

  return {
    bmi,
    category,
    healthyMinKg,
    healthyMaxKg,
    message: MESSAGES[category],
    options,
  };
}

/** Suggested targets for a goal: lower for weight loss, higher (and under BMI 25) for gain or muscle. */
export function targetOptions(
  goal: Goal,
  heightCm: number,
  weightKg: number,
): TargetOption[] {
  if (goal === "maintain") return [];
  if (goal === "lose") return weightGuide(heightCm, weightKg).options;
  const top = maxGainWeightKg(heightCm);
  const candidates: TargetOption[] =
    goal === "gain"
      ? [
          {
            kg: Math.round(weightKg * 1.05),
            label: "First milestone",
            note: "Gain 5%: a realistic first step",
          },
          {
            kg: Math.round(weightKg * 1.1),
            label: "Steady goal",
            note: "Gain 10%: a solid, healthy change",
          },
          {
            kg: minHealthyWeightKg(heightCm),
            label: "Healthy weight",
            note: "Lowest healthy weight for your height",
          },
        ]
      : [
          {
            kg: Math.round(weightKg + 2),
            label: "First milestone",
            note: "Add 2 kg of mostly muscle",
          },
          {
            kg: Math.round(weightKg + 4),
            label: "Steady goal",
            note: "Add 4 kg with steady training",
          },
        ];
  const seen = new Set<number>();
  return candidates.filter((o) => {
    const ok = o.kg > weightKg && o.kg <= top && !seen.has(o.kg);
    seen.add(o.kg);
    return ok;
  });
}

/** A short note when the chosen goal doesn't fit the person's BMI; null when it does. */
export function goalAdvice(
  goal: Goal,
  heightCm: number,
  weightKg: number,
): string | null {
  const bmi = bmiOf(heightCm, weightKg);
  const category = bmiCategory(bmi);
  if (goal === "lose" && category === "underweight")
    return MESSAGES.underweight;
  if (goal === "gain" && bmi >= 25)
    return 'Your weight is already above the healthy range, so gaining more isn\'t recommended. Pick "Stay healthy", or "Build muscle" to eat at maintenance with extra protein.';
  if (goal === "muscle" && bmi >= 25)
    return "Your BMI is high, so we won't add extra calories. Thali will plan maintenance calories with extra protein, which suits training while keeping fat steady.";
  if (goal === "gain" && category === "healthy")
    return 'You\'re in the healthy range. You can add weight slowly, or pick "Stay healthy" to keep it steady.';
  return null;
}
