import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCustomFood,
  EMPTY_CUSTOM_FOOD,
  macroKcal,
  newCustomFoodId,
  toCustomFoodInput,
  type CustomFoodInput,
} from "../customFood.ts";
import { macrosFor } from "../nutrition.ts";

const laddoo: CustomFoodInput = {
  ...EMPTY_CUSTOM_FOOD,
  name: "Besan laddoo",
  unit: "laddoo",
  grams: "30",
  kcal: "130",
  protein: "2.5",
  carbs: "14",
  fat: "7",
  fiber: "1",
};

test("per-serving values become per-100 g values that give the same calories back", () => {
  const r = buildCustomFood(laddoo, "c_1");
  assert.ok("food" in r);
  if (!("food" in r)) return;
  assert.equal(r.food.per100g.kcal, 433);
  assert.equal(Math.round(macrosFor(r.food, 1).kcal), 130);
  assert.equal(Math.round(macrosFor(r.food, 2).kcal), 260);
  assert.equal(r.food.custom, true);
  assert.equal(r.food.verified, false);
});

test("macros are optional when only calories are known", () => {
  const r = buildCustomFood(
    { ...EMPTY_CUSTOM_FOOD, name: "Sweet", grams: "20", kcal: "80" },
    "c_2",
  );
  assert.ok("food" in r);
});

test("calories that don't match the macros are rejected", () => {
  const r = buildCustomFood({ ...laddoo, kcal: "40" }, "c_3");
  assert.ok("error" in r && /don't match/.test(r.error));
  const high = buildCustomFood({ ...laddoo, kcal: "400" }, "c_3");
  assert.ok("error" in high);
  assert.ok(
    Math.abs(macroKcal(2.5, 14, 7, 1) - 130) < 8,
    "the example's macros really do add up to its calories",
  );
});

test("impossible numbers are rejected", () => {
  const bad = (patch: Partial<CustomFoodInput>) =>
    "error" in buildCustomFood({ ...laddoo, ...patch }, "c_4");
  assert.ok(bad({ name: "x" }));
  assert.ok(bad({ grams: "0" }));
  assert.ok(bad({ grams: "5000" }));
  assert.ok(bad({ kcal: "0" }));
  assert.ok(bad({ kcal: "abc" }));
  assert.ok(bad({ protein: "-1" }));
  assert.ok(bad({ fiber: "20" }));
  assert.ok(
    bad({ protein: "20", carbs: "20", fat: "20" }),
    "more than the serving weighs",
  );
});

test("diet tags carry over and editing round-trips", () => {
  const r = buildCustomFood({ ...laddoo, dairy: true, rootVeg: true }, "c_5");
  assert.ok("food" in r);
  if (!("food" in r)) return;
  assert.deepEqual(r.food.tags, { dairy: true, rootVeg: true });
  const back = toCustomFoodInput(r.food);
  assert.equal(back.grams, "30");
  assert.equal(back.kcal, "130");
  assert.equal(back.dairy, true);
});

test("new ids never collide", () => {
  assert.equal(newCustomFoodId([], "a"), "c_a");
  assert.equal(newCustomFoodId(["c_a"], "a"), "c_ax");
});
