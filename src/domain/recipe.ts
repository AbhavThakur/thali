import { FOOD_BY_ID } from "./foods.ts";
import { macrosFor, sumMacros } from "./nutrition.ts";
import type { Food, PlanItemInput } from "./types.ts";

/** What the person types for a dish cooked at home. */
export type RecipeInput = {
  name: string;
  items: PlanItemInput[];
  /** Weight of the finished dish, in grams (the whole pot). */
  cookedGrams: string;
  /** How many servings the dish makes. */
  servings: string;
  /** The serving's name, like katori or piece. */
  unit: string;
};

export const EMPTY_RECIPE: RecipeInput = {
  name: "",
  items: [],
  cookedGrams: "",
  servings: "",
  unit: "katori",
};

const num = (s: string) =>
  s.trim() === "" ? NaN : Number(s.replace(",", "."));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Raw weight of the ingredients, in grams. */
export function ingredientGrams(items: PlanItemInput[]): number {
  return items.reduce((sum, it) => {
    const f = FOOD_BY_ID[it.foodId];
    return f ? sum + f.measure.grams * it.qty : sum;
  }, 0);
}

/** What the whole dish adds up to, from its ingredients. */
export function recipeTotals(items: PlanItemInput[]) {
  return sumMacros(
    items.flatMap((it) =>
      FOOD_BY_ID[it.foodId] ? [macrosFor(FOOD_BY_ID[it.foodId], it.qty)] : [],
    ),
  );
}

/**
 * Turns a home recipe into a food that is logged by the serving: the ingredients' nutrition is spread over the
 * cooked weight, and one serving is the cooked weight divided by the number of servings.
 */
export function buildRecipeFood(
  input: RecipeInput,
  id: string,
): { food: Food } | { error: string } {
  const name = input.name.trim();
  const unit = input.unit.trim();
  if (name.length < 2 || name.length > 40)
    return { error: "Give the recipe a name of 2–40 letters." };
  if (unit.length < 1 || unit.length > 20)
    return { error: "Name the serving, like katori, piece or plate." };
  const items = input.items.filter((it) => FOOD_BY_ID[it.foodId]);
  if (items.length === 0) return { error: "Add at least one ingredient." };
  if (items.some((it) => !(it.qty > 0 && it.qty <= 100)))
    return { error: "Each ingredient needs a quantity above zero." };

  const cooked = num(input.cookedGrams);
  const servings = num(input.servings);
  if (!(cooked >= 20 && cooked <= 20000))
    return { error: "Enter the cooked weight of the whole dish, 20–20000 g." };
  if (!(servings >= 1 && servings <= 100))
    return { error: "Enter how many servings it makes, 1–100." };

  const raw = ingredientGrams(items);
  if (cooked < raw * 0.2 || cooked > raw * 6)
    return {
      error: `The cooked weight (${Math.round(cooked)} g) doesn't look right for ${Math.round(raw)} g of ingredients. Weigh the finished dish, including its water.`,
    };

  const servingGrams = round1(cooked / servings);
  if (!(servingGrams >= 1 && servingGrams <= 1000))
    return {
      error: "One serving would weigh 1–1000 g. Check the number of servings.",
    };

  const total = recipeTotals(items);
  const per100 = (v: number) => round1((v * 100) / cooked);
  const food: Food = {
    id,
    name,
    per100g: {
      kcal: Math.round((total.kcal * 100) / cooked),
      protein: per100(total.protein),
      carbs: per100(total.carbs),
      fat: per100(total.fat),
      fiber: per100(total.fiber),
    },
    measure: { unit, grams: servingGrams },
    tags: {
      ...(items.some((it) => FOOD_BY_ID[it.foodId].tags.dairy) && {
        dairy: true,
      }),
      ...(items.some((it) => FOOD_BY_ID[it.foodId].tags.egg) && { egg: true }),
      ...(items.some((it) => FOOD_BY_ID[it.foodId].tags.meat) && {
        meat: true,
      }),
      ...(items.some((it) => FOOD_BY_ID[it.foodId].tags.rootVeg) && {
        rootVeg: true,
      }),
    },
    verified: false,
    custom: true,
    recipe: { items, cookedGrams: cooked, servings },
  };
  if (
    food.per100g.kcal > 900 ||
    food.per100g.protein + food.per100g.carbs + food.per100g.fat > 100
  )
    return {
      error: "Those numbers are too concentrated. Check the cooked weight.",
    };
  return { food };
}

/** The reverse, for opening a saved recipe in the builder. */
export function toRecipeInput(f: Food): RecipeInput | null {
  if (!f.recipe) return null;
  return {
    name: f.name,
    items: f.recipe.items,
    cookedGrams: String(f.recipe.cookedGrams),
    servings: String(f.recipe.servings),
    unit: f.measure.unit,
  };
}
