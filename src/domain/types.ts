export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type DietType =
  | "vegetarian"
  | "eggetarian"
  | "non_vegetarian"
  | "vegan"
  | "jain";
export type Goal = "lose" | "maintain" | "gain" | "muscle";

/** Answers from the onboarding health check; `none` means the person ticked "none of these". */
export type Health = {
  pregnant: boolean;
  ed: boolean;
  medical: boolean;
  none: boolean;
};
export type SlotId =
  | "early_morning"
  | "breakfast"
  | "lunch"
  | "snack"
  | "dinner"
  | "bedtime";

export type Profile = {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  activity: ActivityLevel;
  dietType: DietType;
  goal: Goal;
  /** Pace for a weight-loss goal, kg per week. */
  weeklyLossKg: number;
  /** Pace for a gain or muscle goal, kg per week. */
  weeklyGainKg: number;
};

export type Macros = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export type Food = {
  id: string;
  name: string;
  per100g: Macros;
  /** Household measure, e.g. 1 roti = 40 g, 1 katori = 150 g. Quantities are logged in these units. */
  measure: { unit: string; grams: number };
  tags: { dairy?: boolean; egg?: boolean; meat?: boolean; rootVeg?: boolean };
  /** false = approximate home-style value, not yet checked against IFCT. */
  verified: boolean;
  /** Added by the user; stored on the phone, not part of the built-in list. */
  custom?: boolean;
};

export type TemplateItem = { foodId: string; qty: number; step: number };
export type MealTemplate = { id: string; slot: SlotId; items: TemplateItem[] };

export type PlannedItem = { food: Food; qty: number; macros: Macros };
export type MealOption = {
  templateId: string;
  items: PlannedItem[];
  totals: Macros;
  /** true when the user has edited this option. */
  edited?: boolean;
};
export type SlotPlan = {
  slot: SlotId;
  label: string;
  targetKcal: number;
  options: MealOption[];
};

export type PlanItemInput = { foodId: string; qty: number };
/** A user's edit of one meal option. `date` "" means every day. */
export type PlanOverride = {
  slot: SlotId;
  templateId: string;
  date: string;
  items: PlanItemInput[];
};
