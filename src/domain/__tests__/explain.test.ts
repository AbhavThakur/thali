import assert from "node:assert/strict";
import { test } from "node:test";
import { calorieTarget } from "../energy.ts";
import { dayImpact, explainFood, explainMeal } from "../explain.ts";
import { FOOD_BY_ID } from "../foods.ts";
import { macrosFor } from "../nutrition.ts";
import type { Macros, Profile } from "../types.ts";

const woman: Profile = {
  name: "A",
  sex: "female",
  age: 32,
  heightCm: 160,
  weightKg: 70,
  targetWeightKg: 60,
  activity: "light",
  dietType: "vegetarian",
  goal: "lose",
  weeklyLossKg: 0.5,
  weeklyGainKg: 0.25,
};

const m = (kcal: number, protein = 0): Macros => ({
  kcal,
  protein,
  carbs: 0,
  fat: 0,
  fiber: 0,
});

test("explainFood ends with the same calories the app shows", () => {
  const food = Object.values(FOOD_BY_ID)[0];
  const lines = explainFood(food, 2);
  assert.equal(lines.length, 3);
  assert.ok(
    lines[2].endsWith(`= ${Math.round(macrosFor(food, 2).kcal)} kcal.`),
    lines[2],
  );
});

test("explainFood says quick adds are used as typed", () => {
  const food = { ...Object.values(FOOD_BY_ID)[0], quick: true };
  assert.equal(explainFood(food, 1).length, 1);
});

test("dayImpact shows what is left, then what is over", () => {
  const target = { ...m(1800, 90) };
  const under = dayImpact(m(1000, 30), target, m(200, 10));
  assert.match(under.kcal, /11% of today's 1,800 kcal\. 600 kcal left/);
  assert.equal(under.over, false);
  assert.match(under.protein, /40 g of 90 g/);

  const over = dayImpact(m(1700), target, m(300));
  assert.match(over.kcal, /200 kcal over/);
  assert.equal(over.over, true);
});

test("explainMeal uses this person's own numbers", () => {
  const t = calorieTarget(woman);
  const [day, meal] = explainMeal(woman, "lunch");
  assert.match(day.body, /off every day/);
  assert.ok(
    day.title.includes(Math.round(t.kcal).toLocaleString("en-IN")),
    day.title,
  );
  assert.match(meal.title, /^Lunch: /);
  assert.match(meal.body, /30% of/);
});

test("explainMeal explains a held-at-maintenance plan", () => {
  const [day] = explainMeal({ ...woman, goal: "maintain" }, "dinner");
  assert.match(day.body, /stay where you are/);
});
