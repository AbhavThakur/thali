import {
  GAIN_BMI_LIMIT,
  maxGainWeightKg,
  minHealthyWeightKg,
} from "../domain/energy.ts";
import {
  planForWeeks,
  timelineFor,
  weeksForRate,
  type Timeline,
  type TimelinePlan,
} from "../domain/timeline.ts";
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

export type Scheduled = {
  /** The form with pace and date filled in from the chosen number of weeks. */
  form: Form;
  /** The profile before the schedule is applied; null while the form is incomplete. */
  base: Profile | null;
  /** Null when there is nothing to schedule: staying healthy, at the target, or gaining isn't advised. */
  timeline: Timeline | null;
  plan: TimelinePlan | null;
};

/** The pace and the date go together: pick one and the other follows. `weeks` null means the recommended date. */
export function schedule(
  form: Form,
  weeks: number | null,
  from: string,
  /** false: use the pace but don't keep a target date. */
  withDate = true,
): Scheduled {
  const base = toProfile(form);
  if (typeof base === "string")
    return { form, base: null, timeline: null, plan: null };
  const timeline = timelineFor(base);
  const plan = timeline
    ? planForWeeks(base, weeks ?? timeline.recommendedWeeks, from)
    : null;
  if (!timeline || !plan)
    return {
      form: { ...form, targetDate: undefined },
      base,
      timeline: null,
      plan: null,
    };
  return {
    form: {
      ...form,
      weeklyLossKg: plan.profile.weeklyLossKg,
      weeklyGainKg: plan.profile.weeklyGainKg,
      targetDate: withDate ? plan.date : undefined,
    },
    base,
    timeline,
    plan,
  };
}

/** The number of weeks a saved profile's pace takes, so editing it keeps the same pace. */
export function savedWeeks(p: Profile): number | null {
  const t = timelineFor(p);
  return t
    ? weeksForRate(t, p.goal === "lose" ? p.weeklyLossKg : p.weeklyGainKg)
    : null;
}
