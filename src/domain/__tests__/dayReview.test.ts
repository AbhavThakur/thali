import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewDay } from "../dayReview.ts";
import type { Macros } from "../types.ts";

const m = (kcal: number, protein: number): Macros => ({
  kcal,
  protein,
  carbs: 0,
  fat: 0,
  fiber: 0,
});
const target = m(1800, 90);
const base = {
  eaten: m(1800, 90),
  target,
  slotsLogged: ["breakfast", "lunch", "dinner"],
  water: 8,
  waterGoal: 8,
  goal: "lose" as const,
  diet: "vegetarian" as const,
  hour: 21,
};

test("no review before evening or with nothing logged", () => {
  assert.equal(reviewDay({ ...base, hour: 15 }), null);
  assert.equal(reviewDay({ ...base, slotsLogged: [] }), null);
});

test("a perfect day says so", () => {
  const r = reviewDay(base);
  assert.match(r?.headline ?? "", /three-star/);
  assert.match(r?.tip ?? "", /all landed/);
});

test("low protein suggests foods that fit the diet", () => {
  const veg = reviewDay({ ...base, eaten: m(1800, 40) });
  assert.match(veg?.tip ?? "", /Protein was 40 g of 90 g.*paneer/);
  const nonVeg = reviewDay({
    ...base,
    eaten: m(1800, 40),
    diet: "non_vegetarian",
  });
  assert.match(nonVeg?.tip ?? "", /chicken/);
  const vegan = reviewDay({ ...base, eaten: m(1800, 40), diet: "vegan" });
  assert.doesNotMatch(vegan?.tip ?? "", /paneer|curd|eggs/);
});

test("eating less is never praised", () => {
  const lose = reviewDay({ ...base, eaten: m(1200, 90) });
  assert.match(lose?.tip ?? "", /Skipping food slows you down/);
  const gain = reviewDay({ ...base, eaten: m(1200, 90), goal: "gain" });
  assert.match(gain?.tip ?? "", /600 kcal less/);
});

test("over target is gentle, and a bigger overshoot is fine when building", () => {
  assert.match(reviewDay({ ...base, eaten: m(2100, 90) })?.tip ?? "", /fine/);
  assert.match(
    reviewDay({ ...base, eaten: m(2100, 90), goal: "muscle" })?.tip ?? "",
    /all landed/,
  );
});

test("a missing main meal comes first, then water", () => {
  const meal = reviewDay({ ...base, slotsLogged: ["breakfast", "lunch"] });
  assert.match(meal?.tip ?? "", /Log breakfast, lunch and dinner/);
  assert.match(reviewDay({ ...base, water: 3 })?.tip ?? "", /3 of 8 glasses/);
});
