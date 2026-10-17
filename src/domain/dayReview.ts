import { dayStars } from "./rewards.ts";
import type { DietType, Goal, Macros } from "./types.ts";

export type DayReview = {
  /** One line: how the day went. */
  headline: string;
  /** One thing to try tomorrow. */
  tip: string;
};

const PROTEIN_FOODS: Record<DietType, string> = {
  vegetarian: "dal, curd, paneer or sprouts",
  jain: "dal, curd, paneer or sprouts",
  vegan: "dal, chana, soya chunks or tofu",
  eggetarian: "eggs, dal, curd or paneer",
  non_vegetarian: "eggs, chicken, fish or dal",
};

/** From this hour the day is "done enough" to look back on. */
export const REVIEW_HOUR = 19;

/**
 * An end-of-day look back: the stars earned and one tip. Never praises eating less, and never
 * shames: the first gap found (meals, calories, protein, water) becomes the tip.
 */
export function reviewDay(input: {
  eaten: Macros;
  target: Macros;
  slotsLogged: string[];
  water: number;
  waterGoal: number;
  goal: Goal;
  diet: DietType;
  hour: number;
}): DayReview | null {
  const { eaten, target, slotsLogged, water, waterGoal, goal, diet } = input;
  if (input.hour < REVIEW_HOUR || !slotsLogged.length) return null;

  const stars = dayStars(eaten, target, slotsLogged);
  const ratio = eaten.kcal / target.kcal;
  const building = goal === "gain" || goal === "muscle";
  const headline =
    stars.stars === 3
      ? "A full three-star day ⭐⭐⭐"
      : `${stars.stars} of 3 stars today`;

  const tip = !stars.allMeals
    ? "Log breakfast, lunch and dinner tomorrow, even small ones. It makes the day easy to read."
    : ratio < 0.9
      ? building
        ? `You ate ${Math.round(target.kcal - eaten.kcal)} kcal less than your target. A snack like banana with milk or a handful of nuts closes the gap.`
        : "You ate a little less than planned. Skipping food slows you down, so have your full meals tomorrow."
      : ratio > (building ? 1.25 : 1.1)
        ? "A little over today, and that is fine. Keep dinner light tomorrow and carry on."
        : !stars.protein
          ? `Protein was ${Math.round(eaten.protein)} g of ${Math.round(target.protein)} g. Add ${PROTEIN_FOODS[diet]} to one meal tomorrow.`
          : water < waterGoal
            ? `You had ${water} of ${waterGoal} glasses of water. Keep a bottle nearby tomorrow.`
            : "Calories, protein and water all landed. Do the same again tomorrow.";

  return { headline, tip };
}
