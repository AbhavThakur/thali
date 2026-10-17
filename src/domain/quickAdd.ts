import { buildCustomFood, EMPTY_CUSTOM_FOOD } from "./customFood.ts";
import type { Food } from "./types.ts";

export type QuickAddInput = {
  name: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
};

export const EMPTY_QUICK_ADD: QuickAddInput = {
  name: "",
  kcal: "",
  protein: "",
  carbs: "",
  fat: "",
};

export const newQuickFoodId = (salt = Date.now().toString(36)) => `q_${salt}`;

/**
 * A one-off entry for when a food can't be found: just calories, and macros if known.
 * It is stored like an own food (so old logs keep working) but flagged `quick`, which keeps it out of
 * search, My foods and the shared list.
 */
export function buildQuickFood(
  input: QuickAddInput,
  id: string,
): { food: Food } | { error: string } {
  const n = (v: string) => Number(v.trim().replace(",", ".")) || 0;
  // The notional serving must weigh at least as much as the macros, so a big plate still fits.
  const grams = Math.min(1000, Math.max(100, Math.ceil((n(input.protein) + n(input.carbs) + n(input.fat)) / 100) * 100));
  const built = buildCustomFood(
    {
      ...EMPTY_CUSTOM_FOOD,
      name: input.name.trim() || "Quick add",
      unit: "entry",
      grams: String(grams),
      kcal: input.kcal,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
    },
    id,
  );
  if ("error" in built) return built;
  return { food: { ...built.food, quick: true } };
}
