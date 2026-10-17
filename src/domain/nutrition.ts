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

const PLURALS: Record<string, string> = {
  serving: "servings",
  handful: "handfuls",
  bowl: "bowls",
  glass: "glasses",
  cup: "cups",
  apple: "apples",
  banana: "bananas",
  guava: "guavas",
  egg: "eggs",
  date: "dates",
};

/** At most one decimal, no trailing zero: 2, 1.5, 0.3. */
const trim = (n: number) => String(Math.round(n * 10) / 10);

/** "serving (10 pcs)" is the word "serving" with the detail "10 pcs"; plain units have no detail. */
function splitUnit(unit: string): { word: string; detail: string | null } {
  const m = unit.match(/^(.*?)\s*\((.+)\)$/);
  return m ? { word: m[1], detail: m[2] } : { word: unit, detail: null };
}

/** "10 pcs" for 2 servings becomes "20 pcs"; text that doesn't start with a number is left alone. */
function scaleDetail(detail: string, qty: number): string {
  const m = detail.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  return m ? `${trim(Number(m[1]) * qty)} ${m[2]}`.trim() : detail;
}

/** "1.5 katori", "2 roti", "2 servings (20 pcs)": what a quantity of this food looks like on screen. */
export function formatQty(food: Food, qty: number): string {
  const { word, detail } = splitUnit(food.measure.unit);
  const name = qty !== 1 && PLURALS[word] ? PLURALS[word] : word;
  return `${trim(qty)} ${name}${detail ? ` (${scaleDetail(detail, qty)})` : ""}`;
}

/** Whole grams for a quantity: 2 roti of 40 g is 80. */
export const gramsFor = (food: Food, qty: number) =>
  Math.round(food.measure.grams * qty);

/** The quantity plus its weight, like "2 roti · 80 g"; skips the weight when the unit already says it. */
export function describeServing(food: Food, qty: number): string {
  if (food.quick) return qty === 1 ? "quick add" : `quick add × ${trim(qty)}`;
  const { detail } = splitUnit(food.measure.unit);
  const says = detail && /\d\s*(g|ml)\b/i.test(detail);
  return says
    ? formatQty(food, qty)
    : `${formatQty(food, qty)} · ${gramsFor(food, qty)} g`;
}

/** "P 7 g · C 20 g · F 3 g" */
export function macroLine(m: Macros): string {
  const g = (n: number) => `${Math.round(n)} g`;
  return `P ${g(m.protein)} · C ${g(m.carbs)} · F ${g(m.fat)}`;
}

/** The household quantity that weighs `grams` for this food (for people who weigh their food). */
export const qtyFromGrams = (food: Food, grams: number) =>
  Math.round((grams / food.measure.grams) * 1000) / 1000;
