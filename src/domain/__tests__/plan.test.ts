import assert from "node:assert/strict";
import { test } from "node:test";
import { FOOD_BY_ID, FOODS } from "../foods.ts";
import { isAllowed } from "../nutrition.ts";
import { buildDayPlan, SLOTS } from "../plan.ts";
import { TEMPLATES } from "../templates.ts";
import type { DietType } from "../types.ts";

const DIETS: DietType[] = [
  "vegetarian",
  "eggetarian",
  "non_vegetarian",
  "vegan",
  "jain",
];

test("slot shares sum to 100%", () => {
  assert.ok(Math.abs(SLOTS.reduce((a, s) => a + s.share, 0) - 1) < 1e-9);
});

test("every template references a known food", () => {
  for (const t of TEMPLATES)
    for (const it of t.items)
      assert.ok(FOOD_BY_ID[it.foodId], `${t.id} -> ${it.foodId}`);
});

test("food macros roughly match their kcal (Atwater, fiber at 2 kcal/g)", () => {
  for (const f of FOODS) {
    const p = f.per100g;
    const est =
      p.protein * 4 + (p.carbs - p.fiber) * 4 + p.fiber * 2 + p.fat * 9;
    assert.ok(
      Math.abs(est - p.kcal) / p.kcal < 0.15,
      `${f.id}: ${p.kcal} vs ${est.toFixed(0)}`,
    );
  }
});

for (const diet of DIETS) {
  test(`${diet}: plan only contains allowed foods`, () => {
    for (const slot of buildDayPlan(1400, diet)) {
      for (const opt of slot.options)
        for (const it of opt.items)
          assert.ok(isAllowed(it.food, diet), `${diet} got ${it.food.id}`);
    }
  });
}

test("vegetarian main meals have options within 25% of slot target", () => {
  for (const slot of buildDayPlan(1413, "vegetarian")) {
    if (!["breakfast", "lunch", "dinner"].includes(slot.slot)) continue;
    assert.ok(
      slot.options.length >= 2,
      `${slot.slot} has ${slot.options.length} options`,
    );
    for (const opt of slot.options) {
      const err = Math.abs(opt.totals.kcal - slot.targetKcal) / slot.targetKcal;
      assert.ok(
        err < 0.25,
        `${opt.templateId}: ${opt.totals.kcal.toFixed(0)} vs ${slot.targetKcal}`,
      );
    }
  }
});

test("dayIndex rotates options", () => {
  const a = buildDayPlan(1400, "vegetarian", 0).find(
    (s) => s.slot === "lunch",
  )!;
  const b = buildDayPlan(1400, "vegetarian", 1).find(
    (s) => s.slot === "lunch",
  )!;
  assert.notEqual(a.options[0].templateId, b.options[0].templateId);
});
