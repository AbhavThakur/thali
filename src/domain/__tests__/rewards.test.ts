import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACHIEVEMENTS,
  dayStars,
  movingAverage,
  type Stats,
} from "../rewards.ts";
import { bestStreak } from "../streak.ts";
import type { Macros } from "../types.ts";

const target: Macros = {
  kcal: 1500,
  protein: 80,
  carbs: 180,
  fat: 47,
  fiber: 25,
};
const m = (kcal: number, protein: number): Macros => ({
  ...target,
  kcal,
  protein,
});

test("three stars for all meals, on target and protein hit", () => {
  const s = dayStars(m(1500, 80), target, ["breakfast", "lunch", "dinner"]);
  assert.equal(s.stars, 3);
});

test("eating far below target never earns the calorie star", () => {
  const s = dayStars(m(900, 80), target, ["breakfast", "lunch", "dinner"]);
  assert.equal(s.onTarget, false);
  assert.equal(s.stars, 2);
});

test("over target by more than 10% loses only the calorie star", () => {
  const s = dayStars(m(1700, 40), target, ["breakfast", "lunch"]);
  assert.deepEqual(s, {
    stars: 0,
    allMeals: false,
    onTarget: false,
    protein: false,
  });
});

test("bestStreak finds the longest run", () => {
  assert.equal(bestStreak([]), 0);
  assert.equal(
    bestStreak([
      "2026-10-01",
      "2026-10-02",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-07",
    ]),
    3,
  );
});

test("movingAverage smooths with a trailing window", () => {
  assert.deepEqual(movingAverage([70, 72, 71], 2), [70, 71, 71.5]);
});

test("weight achievements use start, current and target", () => {
  const base: Stats = {
    loggedDays: 0,
    bestStreak: 0,
    onTargetDays: 0,
    proteinDays: 0,
    waterDays: 0,
    startKg: 80,
    currentKg: 76,
    targetKg: 70,
    goal: "lose",
  };
  const earned = ACHIEVEMENTS.filter((a) => a.earned(base)).map((a) => a.id);
  assert.deepEqual(earned, ["first_kg", "five_percent"]);
  assert.ok(
    ACHIEVEMENTS.find((a) => a.id === "goal")!.earned({
      ...base,
      currentKg: 70,
    }),
  );
  const gain: Stats = {
    ...base,
    goal: "gain",
    startKg: 55,
    currentKg: 58,
    targetKg: 62,
  };
  assert.deepEqual(
    ACHIEVEMENTS.filter((a) => a.earned(gain)).map((a) => a.id),
    ["first_kg", "five_percent"],
  );
  assert.ok(
    ACHIEVEMENTS.find((a) => a.id === "goal")!.earned({
      ...gain,
      currentKg: 62,
    }),
  );
  const steady: Stats = {
    ...base,
    goal: "maintain",
    currentKg: 70,
    targetKg: 80,
  };
  assert.deepEqual(
    ACHIEVEMENTS.filter((a) => a.earned(steady)).map((a) => a.id),
    [],
    "staying steady earns no weight badges",
  );
});
