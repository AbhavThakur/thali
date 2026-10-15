import assert from "node:assert/strict";
import { test } from "node:test";
import { allFoods, FOOD_BY_ID, FOODS, registerCustomFoods } from "../foods.ts";
import { isAllowed } from "../nutrition.ts";
import {
  applyOverrides,
  buildDayPlan,
  groceryList,
  optionFromItems,
  SLOTS,
} from "../plan.ts";
import { TEMPLATES } from "../templates.ts";
import type { DietType } from "../types.ts";

const DIETS: DietType[] = [
  "vegetarian",
  "eggetarian",
  "non_vegetarian",
  "vegan",
  "jain",
];

test("optionFromItems totals its items and drops unknown or empty ones", () => {
  const [a, b] = FOODS;
  const opt = optionFromItems("t", [
    { foodId: a.id, qty: 2 },
    { foodId: b.id, qty: 0 },
    { foodId: "nope", qty: 1 },
  ]);
  assert.equal(opt.items.length, 1);
  assert.equal(opt.totals.kcal, opt.items[0].macros.kcal);
});

test("applyOverrides prefers a date edit over an every-day edit", () => {
  const plan = buildDayPlan(1600, "vegetarian");
  const slot = plan.find((s) => s.options.length)!;
  const tpl = slot.options[0].templateId;
  const [a, b] = FOODS;
  const out = applyOverrides(plan, [
    {
      slot: slot.slot,
      templateId: tpl,
      date: "",
      items: [{ foodId: a.id, qty: 1 }],
    },
    {
      slot: slot.slot,
      templateId: tpl,
      date: "2026-10-14",
      items: [{ foodId: b.id, qty: 1 }],
    },
  ]);
  const opt = out.find((s) => s.slot === slot.slot)!.options[0];
  assert.equal(opt.edited, true);
  assert.deepEqual(
    opt.items.map((i) => i.food.id),
    [b.id],
  );
  assert.equal(
    out.find((s) => s.slot === slot.slot)!.options[1]?.edited,
    undefined,
  );
});

test("slot shares sum to 100%", () => {
  assert.ok(Math.abs(SLOTS.reduce((a, s) => a + s.share, 0) - 1) < 1e-9);
});

const firstOptionProtein = (plan: ReturnType<typeof buildDayPlan>) =>
  plan.reduce((s, slot) => s + (slot.options[0]?.totals.protein ?? 0), 0);

test("protein-first raises vegetarian protein across a week and keeps variety", () => {
  let plain = 0;
  let boosted = 0;
  const lunches = new Set<string>();
  for (let d = 0; d < 7; d++) {
    plain += firstOptionProtein(buildDayPlan(1500, "vegetarian", d));
    const p = buildDayPlan(1500, "vegetarian", d, 3, true);
    boosted += firstOptionProtein(p);
    lunches.add(p.find((s) => s.slot === "lunch")!.options[0].templateId);
  }
  assert.ok(boosted > plain, `${boosted} vs ${plain}`);
  assert.ok(lunches.size > 1);
});

test("Today's single suggestion matches Plan's first option", () => {
  for (const diet of DIETS) {
    const full = buildDayPlan(1600, diet, 3, 3, true);
    const one = buildDayPlan(1600, diet, 3, 1, true);
    full.forEach((s, i) =>
      assert.equal(one[i].options[0]?.templateId, s.options[0]?.templateId),
    );
  }
});

test("groceryList totals first options across days", () => {
  const days = [
    buildDayPlan(1500, "vegetarian", 0),
    buildDayPlan(1500, "vegetarian", 0),
  ];
  const list = groceryList(days);
  const one = groceryList([days[0]]);
  assert.equal(list.length, one.length);
  assert.equal(list[0].grams, one[0].grams * 2);
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

const MAIN_SLOTS = ["breakfast", "lunch", "dinner"];

for (const diet of DIETS) {
  test(`${diet}: every meal has an option and main meals have two or more`, () => {
    for (const slot of buildDayPlan(1800, diet, 0))
      assert.ok(
        slot.options.length >= (MAIN_SLOTS.includes(slot.slot) ? 2 : 1),
        `${diet} ${slot.slot} has ${slot.options.length}`,
      );
  });

  test(`${diet}: the average pick adds up to the day target (1200–3500 kcal)`, () => {
    for (const target of [1200, 1500, 1800, 2200, 2600, 3000, 3500])
      for (const protein of [false, true])
        for (let day = 0; day < 14; day++) {
          const plan = buildDayPlan(target, diet, day, 3, protein);
          const avg = plan.reduce(
            (sum, s) =>
              sum +
              (s.options.length
                ? s.options.reduce((a, o) => a + o.totals.kcal, 0) /
                  s.options.length
                : 0),
            0,
          );
          const err = Math.abs(avg - target) / target;
          assert.ok(
            err < 0.04,
            `${diet} ${target} day ${day}: ${avg.toFixed(0)} kcal (${(err * 100).toFixed(1)}% off)`,
          );
        }
  });
}

test("a day's plan doesn't change with the number of options shown", () => {
  const few = buildDayPlan(2000, "vegetarian", 5, 1, true);
  const many = buildDayPlan(2000, "vegetarian", 5, 3, true);
  few.forEach((s, i) =>
    assert.equal(
      s.options[0]?.totals.kcal,
      many[i].options[0]?.totals.kcal,
      s.slot,
    ),
  );
});

test("built-in food values are sane", () => {
  for (const f of FOODS) {
    const p = f.per100g;
    assert.ok(p.kcal > 0 && f.measure.grams > 0, f.id);
    assert.ok(p.protein + p.carbs + p.fat <= 100, `${f.id} adds to over 100 g`);
    assert.ok(p.fiber <= p.carbs, `${f.id} fiber above carbs`);
  }
  assert.equal(new Set(FOODS.map((f) => f.id)).size, FOODS.length);
});

test("custom foods join lookups and plans, and can be replaced", () => {
  const mine = {
    id: "c_test",
    name: "My laddoo",
    per100g: { kcal: 400, protein: 8, carbs: 55, fat: 17, fiber: 2 },
    measure: { unit: "laddoo", grams: 30 },
    tags: {},
    verified: false,
  };
  registerCustomFoods([mine]);
  assert.equal(FOOD_BY_ID.c_test.custom, true);
  assert.ok(allFoods().some((f) => f.id === "c_test"));
  const opt = optionFromItems("t", [{ foodId: "c_test", qty: 2 }]);
  assert.equal(Math.round(opt.totals.kcal), 240);
  registerCustomFoods([]);
  assert.equal(FOOD_BY_ID.c_test, undefined);
  assert.equal(allFoods().length, FOODS.length);
});
