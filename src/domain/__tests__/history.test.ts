import assert from "node:assert/strict";
import { test } from "node:test";
import { FOODS } from "../foods.ts";
import {
  buildHistory,
  periodStats,
  shiftDate,
  type HistoryLog,
} from "../history.ts";
import type { Macros } from "../types.ts";

const target: Macros = {
  kcal: 1500,
  protein: 80,
  carbs: 180,
  fat: 47,
  fiber: 25,
};
const food = FOODS[0].id;
let id = 0;
const log = (date: string, slot: HistoryLog["slot"], qty = 1): HistoryLog => ({
  id: ++id,
  date,
  slot,
  food_id: food,
  qty,
});
const empty = { logs: [], water: [], weights: [], target };

test("shiftDate crosses month and year boundaries", () => {
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
});

test("lists every day newest first, including days with nothing logged", () => {
  const days = buildHistory(empty, "2026-10-12", "2026-10-15");
  assert.deepEqual(
    days.map((d) => d.date),
    ["2026-10-15", "2026-10-14", "2026-10-13", "2026-10-12"],
  );
  assert.ok(
    days.every((d) => !d.logged && d.stars === null && d.meals.length === 0),
  );
});

test("groups a day's logs into meals in slot order with totals", () => {
  const days = buildHistory(
    {
      ...empty,
      logs: [log("2026-10-14", "dinner"), log("2026-10-14", "breakfast", 2)],
    },
    "2026-10-14",
    "2026-10-14",
  );
  const [day] = days;
  assert.equal(day.logged, true);
  assert.deepEqual(
    day.meals.map((m) => m.slot),
    ["breakfast", "dinner"],
  );
  assert.equal(day.meals[0].items[0].qty, 2);
  assert.ok(
    Math.abs(day.totals.kcal - day.meals.reduce((s, m) => s + m.kcal, 0)) <
      1e-6,
  );
});

test("water and weight attach to their day, even without food logs", () => {
  const [day] = buildHistory(
    {
      ...empty,
      water: [{ date: "2026-10-14", glasses: 6 }],
      weights: [{ date: "2026-10-14", kg: 69.5 }],
    },
    "2026-10-14",
    "2026-10-14",
  );
  assert.equal(day.logged, false);
  assert.equal(day.water, 6);
  assert.equal(day.weightKg, 69.5);
});

test("ignores logs for foods that no longer exist", () => {
  const [day] = buildHistory(
    {
      ...empty,
      logs: [
        { id: 999, date: "2026-10-14", slot: "lunch", food_id: "gone", qty: 1 },
      ],
    },
    "2026-10-14",
    "2026-10-14",
  );
  assert.equal(day.logged, false);
});

test("periodStats averages only logged days and measures weight change", () => {
  const days = buildHistory(
    {
      ...empty,
      logs: [log("2026-10-15", "lunch", 2), log("2026-10-13", "lunch", 4)],
      weights: [
        { date: "2026-10-15", kg: 69 },
        { date: "2026-10-12", kg: 70 },
      ],
    },
    "2026-10-12",
    "2026-10-15",
  );
  const s = periodStats(days);
  assert.equal(s.days, 4);
  assert.equal(s.loggedDays, 2);
  assert.equal(
    s.avgKcal,
    Math.round((days[0].totals.kcal + days[2].totals.kcal) / 2),
  );
  assert.equal(s.weightChangeKg, -1);
});

test("periodStats of an empty period is all zeros with no weight change", () => {
  const s = periodStats(buildHistory(empty, "2026-10-14", "2026-10-15"));
  assert.deepEqual(s, {
    days: 2,
    loggedDays: 0,
    avgKcal: 0,
    avgProtein: 0,
    onTargetDays: 0,
    stars: 0,
    weightChangeKg: null,
  });
});
