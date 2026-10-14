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
  weeklyLossKg: number;
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
};

export type TemplateItem = { foodId: string; qty: number; step: number };
export type MealTemplate = { id: string; slot: SlotId; items: TemplateItem[] };

export type PlannedItem = { food: Food; qty: number; macros: Macros };
export type MealOption = {
  templateId: string;
  items: PlannedItem[];
  totals: Macros;
};
export type SlotPlan = {
  slot: SlotId;
  label: string;
  targetKcal: number;
  options: MealOption[];
};
