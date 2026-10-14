import assert from "node:assert/strict";
import { test } from "node:test";
import { bmr, calorieTarget, macroTargets, MIN_KCAL } from "../energy.ts";
import type { Profile } from "../types.ts";

const woman: Profile = {
  name: "A",
  sex: "female",
  age: 32,
  heightCm: 160,
  weightKg: 70,
  targetWeightKg: 60,
  activity: "light",
  dietType: "vegetarian",
  weeklyLossKg: 0.5,
};

test("bmr uses Mifflin-St Jeor", () => {
  assert.equal(bmr(woman), 10 * 70 + 6.25 * 160 - 5 * 32 - 161);
  assert.equal(
    bmr({ ...woman, sex: "male" }),
    10 * 70 + 6.25 * 160 - 5 * 32 + 5,
  );
});

test("0.5 kg/week gives ~550 kcal deficit when under the cap", () => {
  const t = calorieTarget({
    ...woman,
    sex: "male",
    weightKg: 80,
    heightCm: 175,
    activity: "moderate",
  });
  assert.ok(Math.abs(t.deficit - 550) <= 1, `deficit ${t.deficit}`);
  assert.equal(t.clampedToFloor, false);
});

test("deficit is capped at 25% of TDEE", () => {
  const t = calorieTarget({ ...woman, weeklyLossKg: 1 });
  assert.ok(t.deficit <= t.tdee * 0.25 + 1);
});

test("never goes below the safety floor", () => {
  const small: Profile = {
    ...woman,
    weightKg: 45,
    heightCm: 148,
    age: 60,
    activity: "sedentary",
    weeklyLossKg: 1,
  };
  const t = calorieTarget(small);
  assert.equal(t.kcal, MIN_KCAL.female);
  assert.equal(t.clampedToFloor, true);
});

test("macro targets add back up to the calorie target", () => {
  const m = macroTargets(woman, 1413);
  const kcal = m.protein * 4 + m.carbs * 4 + m.fat * 9;
  assert.ok(Math.abs(kcal - 1413) < 15, `got ${kcal}`);
  assert.ok(m.fiber >= 25);
});
