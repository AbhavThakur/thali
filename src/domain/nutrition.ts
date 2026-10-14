import type { DietType, Food, Macros } from "./types.ts";

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

/** Macros for `qty` household units of a food. */
export function macrosFor(food: Food, qty: number): Macros {
  const f = (qty * food.measure.grams) / 100;
  const p = food.per100g;
  return {
    kcal: p.kcal * f,
    protein: p.protein * f,
    carbs: p.carbs * f,
    fat: p.fat * f,
    fiber: p.fiber * f,
  };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      protein: a.protein + m.protein,
      carbs: a.carbs + m.carbs,
      fat: a.fat + m.fat,
      fiber: a.fiber + m.fiber,
    }),
    ZERO,
  );
}

export function isAllowed(food: Food, diet: DietType): boolean {
  const t = food.tags;
  switch (diet) {
    case "non_vegetarian":
      return true;
    case "eggetarian":
      return !t.meat;
    case "vegetarian":
      return !t.meat && !t.egg;
    case "jain":
      return !t.meat && !t.egg && !t.rootVeg;
    case "vegan":
      return !t.meat && !t.egg && !t.dairy;
  }
}

/** "1.5 katori", "2 roti" */
export function formatQty(food: Food, qty: number): string {
  return `${Number.isInteger(qty) ? qty : qty.toFixed(1)} ${food.measure.unit}`;
}
