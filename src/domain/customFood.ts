import type { Food } from "./types.ts";

/** What the user types, per one serving, as printed on a pack or worked out from a recipe. */
export type CustomFoodInput = {
  name: string;
  /** The serving's name, e.g. "laddoo" or "katori". */
  unit: string;
  grams: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  dairy: boolean;
  egg: boolean;
  meat: boolean;
  rootVeg: boolean;
};

export const EMPTY_CUSTOM_FOOD: CustomFoodInput = {
  name: "",
  unit: "serving",
  grams: "",
  kcal: "",
  protein: "",
  carbs: "",
  fat: "",
  fiber: "",
  dairy: false,
  egg: false,
  meat: false,
  rootVeg: false,
};

const num = (s: string) => (s.trim() === "" ? 0 : Number(s.replace(",", ".")));

/** Calories a food's macros add up to (fiber counts about half as much as other carbs). */
export const macroKcal = (p: number, c: number, f: number, fiber: number) =>
  p * 4 + (c - fiber) * 4 + fiber * 2 + f * 9;

/** How far the typed calories may be from what the macros add up to. */
const KCAL_TOLERANCE = 0.3;

export function newCustomFoodId(
  existing: string[],
  salt = Date.now().toString(36),
) {
  let id = `c_${salt}`;
  while (existing.includes(id)) id += "x";
  return id;
}

/** Turns the typed values into a Food (per 100 g), or says what is wrong. */
export function buildCustomFood(
  input: CustomFoodInput,
  id: string,
): { food: Food } | { error: string } {
  const name = input.name.trim();
  const unit = input.unit.trim();
  if (name.length < 2 || name.length > 40)
    return { error: "Give the food a name of 2–40 letters." };
  if (unit.length < 1 || unit.length > 20)
    return { error: "Name the serving, like katori, piece or glass." };
  const grams = num(input.grams);
  const kcal = num(input.kcal);
  const protein = num(input.protein);
  const carbs = num(input.carbs);
  const fat = num(input.fat);
  const fiber = num(input.fiber);
  if (![grams, kcal, protein, carbs, fat, fiber].every(Number.isFinite))
    return { error: "Use numbers only, like 150 or 2.5." };
  if (!(grams >= 1 && grams <= 1000))
    return { error: "The serving weight must be 1–1000 g." };
  if (!(kcal >= 1 && kcal <= 3000))
    return { error: "Calories per serving must be 1–3000." };
  if ([protein, carbs, fat, fiber].some((v) => v < 0))
    return { error: "Protein, carbs, fat and fiber can't be negative." };
  if (fiber > carbs)
    return { error: "Fiber is part of carbs, so it can't be more than carbs." };
  if (protein + carbs + fat > grams)
    return {
      error: `Protein, carbs and fat add up to more than the ${grams} g serving.`,
    };
  const hasMacros = protein + carbs + fat > 0;
  if (hasMacros) {
    const implied = macroKcal(protein, carbs, fat, fiber);
    if (Math.abs(implied - kcal) / Math.max(kcal, implied) > KCAL_TOLERANCE)
      return {
        error: `The calories don't match the macros: protein, carbs and fat add up to about ${Math.round(implied)} kcal, but you entered ${Math.round(kcal)}. Check the numbers.`,
      };
  }
  const per100 = (v: number) => Math.round(((v * 100) / grams) * 10) / 10;
  return {
    food: {
      id,
      name,
      per100g: {
        kcal: Math.round((kcal * 100) / grams),
        protein: per100(protein),
        carbs: per100(carbs),
        fat: per100(fat),
        fiber: per100(fiber),
      },
      measure: { unit, grams },
      tags: {
        ...(input.dairy && { dairy: true }),
        ...(input.egg && { egg: true }),
        ...(input.meat && { meat: true }),
        ...(input.rootVeg && { rootVeg: true }),
      },
      verified: false,
      custom: true,
    },
  };
}

/** The reverse of `buildCustomFood`, for editing a saved food. */
export function toCustomFoodInput(f: Food): CustomFoodInput {
  const per = (v: number) =>
    String(Math.round(((v * f.measure.grams) / 100) * 10) / 10);
  return {
    name: f.name,
    unit: f.measure.unit,
    grams: String(f.measure.grams),
    kcal: String(Math.round((f.per100g.kcal * f.measure.grams) / 100)),
    protein: per(f.per100g.protein),
    carbs: per(f.per100g.carbs),
    fat: per(f.per100g.fat),
    fiber: per(f.per100g.fiber),
    dairy: !!f.tags.dairy,
    egg: !!f.tags.egg,
    meat: !!f.tags.meat,
    rootVeg: !!f.tags.rootVeg,
  };
}
