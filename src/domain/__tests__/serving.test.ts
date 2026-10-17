import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeServing,
  formatQty,
  gramsFor,
  macroLine,
  qtyFromGrams,
} from "../nutrition.ts";
import type { Food } from "../types.ts";

const food = (unit: string, grams: number): Food => ({
  id: "x",
  name: "X",
  per100g: { kcal: 100, protein: 5, carbs: 15, fat: 2, fiber: 1 },
  measure: { unit, grams },
  tags: {},
  verified: false,
});

test("plain units read naturally", () => {
  assert.equal(formatQty(food("roti", 40), 2), "2 roti");
  assert.equal(formatQty(food("katori", 150), 1.5), "1.5 katori");
  assert.equal(formatQty(food("glass", 200), 1), "1 glass");
  assert.equal(formatQty(food("glass", 200), 2), "2 glasses");
  assert.equal(formatQty(food("egg", 50), 3), "3 eggs");
  assert.equal(formatQty(food("tsp", 5), 2), "2 tsp");
});

test("a unit with a detail scales the detail, so 2 servings of 10 pieces is 20 pieces", () => {
  const almonds = food("serving (10 pcs)", 12);
  assert.equal(formatQty(almonds, 1), "1 serving (10 pcs)");
  assert.equal(formatQty(almonds, 2), "2 servings (20 pcs)");
  assert.equal(formatQty(almonds, 0.5), "0.5 servings (5 pcs)");
  assert.equal(
    formatQty(food("serving (40 g)", 40), 1.5),
    "1.5 servings (60 g)",
  );
  assert.equal(
    formatQty(food("serving (2 dates)", 16), 2),
    "2 servings (4 dates)",
  );
  assert.equal(formatQty(food("handful (30 g)", 30), 2), "2 handfuls (60 g)");
});

test("the weight is shown unless the unit already states it", () => {
  assert.equal(describeServing(food("roti", 40), 2), "2 roti · 80 g");
  assert.equal(describeServing(food("katori", 150), 1), "1 katori · 150 g");
  assert.equal(
    describeServing(food("serving (40 g)", 40), 2),
    "2 servings (80 g)",
  );
  assert.equal(
    describeServing(food("serving (10 pcs)", 12), 2),
    "2 servings (20 pcs) · 24 g",
  );
});

test("typed grams turn into the household quantity and back", () => {
  const rice = food("katori", 110);
  assert.equal(qtyFromGrams(rice, 55), 0.5);
  assert.equal(qtyFromGrams(rice, 220), 2);
  assert.equal(gramsFor(rice, qtyFromGrams(rice, 137)), 137);
  assert.equal(qtyFromGrams(rice, 100), 0.909);
});

test("the macro line rounds to whole grams", () => {
  assert.equal(
    macroLine({ kcal: 100, protein: 6.6, carbs: 20.2, fat: 2.5, fiber: 1 }),
    "P 7 g · C 20 g · F 3 g",
  );
});
