import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bmr,
  calorieTarget,
  macroTargets,
  maxGainWeightKg,
  MIN_KCAL,
  minHealthyWeightKg,
  normalizeProfile,
  tdee,
} from "../energy.ts";
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
  goal: "lose",
  weeklyLossKg: 0.5,
  weeklyGainKg: 0.25,
};

test("minimum healthy weight is BMI 18.5, rounded up", () => {
  assert.equal(minHealthyWeightKg(160), 48); // 47.36
  assert.equal(minHealthyWeightKg(180), 60); // 59.94
});

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
    targetWeightKg: 42,
    heightCm: 148,
    age: 60,
    activity: "sedentary",
    weeklyLossKg: 1,
  };
  const t = calorieTarget(small);
  assert.equal(t.kcal, MIN_KCAL.female);
  assert.equal(t.clampedToFloor, true);
});

test("at or below target weight the plan switches to maintenance", () => {
  for (const weightKg of [60, 58]) {
    const t = calorieTarget({ ...woman, weightKg });
    assert.equal(t.atGoal, true);
    assert.equal(t.deficit, 0);
    assert.equal(t.kcal, Math.max(t.tdee, MIN_KCAL.female));
  }
  assert.equal(calorieTarget(woman).atGoal, false);
  const tiny = calorieTarget({
    ...woman,
    weightKg: 42,
    targetWeightKg: 42,
    heightCm: 148,
    age: 70,
    activity: "sedentary",
  });
  assert.equal(
    tiny.kcal,
    MIN_KCAL.female,
    "maintenance never drops below the floor",
  );
});

test("macro targets add back up to the calorie target", () => {
  const m = macroTargets(woman, 1413);
  const kcal = m.protein * 4 + m.carbs * 4 + m.fat * 9;
  assert.ok(Math.abs(kcal - 1413) < 15, `got ${kcal}`);
  assert.ok(m.fiber >= 25);
});

const thin: Profile = {
  ...woman,
  sex: "male",
  age: 24,
  heightCm: 175,
  weightKg: 55,
  targetWeightKg: 62,
  activity: "moderate",
  goal: "gain",
};

test("a gain goal eats above maintenance by the chosen pace, capped at 20%", () => {
  const t = calorieTarget({ ...thin, weeklyGainKg: 0.25 });
  assert.ok(Math.abs(t.surplus - 275) <= 1, `surplus ${t.surplus}`);
  assert.equal(t.deficit, 0);
  assert.equal(t.kcal, t.tdee + t.surplus);
  const fast = calorieTarget({ ...thin, weeklyGainKg: 1 });
  assert.ok(fast.surplus <= t.tdee * 0.2 + 1);
});

test("a muscle goal uses a smaller surplus than a gain goal", () => {
  const gain = calorieTarget({ ...thin, weeklyGainKg: 0.5 });
  const muscle = calorieTarget({ ...thin, goal: "muscle", weeklyGainKg: 0.5 });
  assert.ok(muscle.surplus > 0 && muscle.surplus < gain.surplus);
  assert.ok(muscle.surplus <= muscle.tdee * 0.12 + 1);
});

test("gain goals hold at maintenance at BMI 25 or more, or once the target is reached", () => {
  const heavy = calorieTarget({
    ...thin,
    weightKg: 80,
    targetWeightKg: 85,
    goal: "muscle",
  });
  assert.equal(heavy.gainBlocked, true);
  assert.equal(heavy.surplus, 0);
  assert.equal(heavy.kcal, heavy.tdee);
  const reached = calorieTarget({ ...thin, weightKg: 62 });
  assert.equal(reached.atGoal, true);
  assert.equal(reached.surplus, 0);
});

test("stay-healthy eats at maintenance and never below the floor", () => {
  const t = calorieTarget({ ...woman, goal: "maintain" });
  assert.equal(t.kcal, Math.round(tdee(woman)));
  assert.equal(t.deficit + t.surplus, 0);
  const tiny = calorieTarget({
    ...woman,
    goal: "maintain",
    weightKg: 42,
    heightCm: 148,
    age: 70,
    activity: "sedentary",
  });
  assert.equal(tiny.kcal, MIN_KCAL.female);
});

test("muscle goals get more protein per kg than weight loss, and still add up", () => {
  const lose = macroTargets(woman, 1800);
  const muscle = macroTargets({ ...woman, goal: "muscle" }, 1800);
  assert.ok(muscle.protein > lose.protein);
  assert.ok(muscle.protein * 4 <= 1800 * 0.35 + 4);
  const kcal = muscle.protein * 4 + muscle.carbs * 4 + muscle.fat * 9;
  assert.ok(Math.abs(kcal - 1800) < 15, `got ${kcal}`);
});

test("profiles saved before goals existed become weight-loss plans", () => {
  const old = { ...woman } as Partial<Profile>;
  delete old.goal;
  delete old.weeklyGainKg;
  const p = normalizeProfile(old as Profile);
  assert.equal(p.goal, "lose");
  assert.equal(p.weeklyGainKg, 0.25);
  assert.equal(
    calorieTarget(old as Profile).kcal,
    calorieTarget(woman).kcal,
    "missing goal still computes as a loss plan",
  );
});

test("highest gain weight stays under BMI 25", () => {
  assert.equal(maxGainWeightKg(175), 76); // 24.9 * 1.75^2 = 76.26
});
