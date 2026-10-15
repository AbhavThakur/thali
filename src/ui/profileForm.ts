import {
  GAIN_BMI_LIMIT,
  maxGainWeightKg,
  minHealthyWeightKg,
} from "../domain/energy.ts";
import type {
  ActivityLevel,
  DietType,
  Goal,
  Profile,
  Sex,
} from "../domain/types.ts";

export const SEX: [Sex, string][] = [
  ["female", "Female"],
  ["male", "Male"],
];
export const ACTIVITY: [ActivityLevel, string][] = [
  ["sedentary", "Desk job"],
  ["light", "Light"],
  ["moderate", "Moderate"],
  ["active", "Active"],
  ["very_active", "Very active"],
];
export const DIET: [DietType, string][] = [
  ["vegetarian", "Veg"],
  ["eggetarian", "Egg"],
  ["non_vegetarian", "Non-veg"],
  ["vegan", "Vegan"],
  ["jain", "Jain"],
];
export const PACE: [number, string][] = [
  [0.25, "0.25 kg/wk"],
  [0.5, "0.5 kg/wk"],
  [0.75, "0.75 kg/wk"],
];
/** Gaining faster than this mostly adds fat. */
export const GAIN_PACE: [number, string][] = [
  [0.25, "0.25 kg/wk"],
  [0.5, "0.5 kg/wk"],
];
export const GOAL_LABEL: Record<Goal, string> = {
  lose: "Lose weight",
  maintain: "Stay healthy",
  gain: "Gain weight",
  muscle: "Build muscle",
};

export type Form = Omit<
  Profile,
  "age" | "heightCm" | "weightKg" | "targetWeightKg"
> & {
  age: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
};

export const EMPTY: Form = {
  name: "",
  sex: "female",
  age: "",
  heightCm: "",
  weightKg: "",
  targetWeightKg: "",
  activity: "light",
  dietType: "vegetarian",
  goal: "lose",
  weeklyLossKg: 0.5,
  weeklyGainKg: 0.25,
};

export function toForm(p: Profile): Form {
  return {
    ...p,
    age: String(p.age),
    heightCm: String(p.heightCm),
    weightKg: String(p.weightKg),
    targetWeightKg: String(p.targetWeightKg),
  };
}

export function ageError(age: string): string | null {
  const n = +age;
  return n >= 18 && n <= 80
    ? null
    : "Age must be 18–80. This app is not for children or teens.";
}

/** Returns a valid Profile, or the first problem as a message. */
export function toProfile(f: Form): Profile | string {
  const n = {
    age: +f.age,
    heightCm: +f.heightCm,
    weightKg: +f.weightKg,
    targetWeightKg: +f.targetWeightKg,
  };
  const age = ageError(f.age);
  if (age) return age;
  if (!(n.heightCm >= 120 && n.heightCm <= 220))
    return "Height must be 120–220 cm.";
  if (!(n.weightKg >= 30 && n.weightKg <= 250))
    return "Weight must be 30–250 kg.";
  const bmi = n.weightKg / (n.heightCm / 100) ** 2;
  if (f.goal === "maintain")
    return { ...f, name: f.name.trim(), ...n, targetWeightKg: n.weightKg };
  if (f.goal === "gain" || f.goal === "muscle") {
    // Training at a high BMI is a recomposition: same weight, more protein.
    if (f.goal === "muscle" && bmi >= GAIN_BMI_LIMIT)
      return { ...f, name: f.name.trim(), ...n, targetWeightKg: n.weightKg };
    if (bmi >= GAIN_BMI_LIMIT)
      return "Your weight is already above the healthy range. Choose Stay healthy or Build muscle instead.";
    const top = maxGainWeightKg(n.heightCm);
    if (!(n.targetWeightKg > n.weightKg))
      return "Your target weight must be above your current weight.";
    if (n.targetWeightKg > top)
      return `For your height, the highest target is ${top} kg (just under BMI 25).`;
    return { ...f, name: f.name.trim(), ...n };
  }
  if (!(n.targetWeightKg >= 30 && n.targetWeightKg <= 250))
    return "Target weight must be 30–250 kg.";
  const minKg = minHealthyWeightKg(n.heightCm);
  if (n.targetWeightKg < minKg)
    return `For your height, the lowest healthy target is ${minKg} kg (BMI 18.5).`;
  return { ...f, name: f.name.trim(), ...n };
}
