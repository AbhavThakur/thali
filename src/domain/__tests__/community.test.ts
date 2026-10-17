import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allFoods,
  FOOD_BY_ID,
  FOODS,
  isReplacedByShared,
  registerCommunityFoods,
  registerCustomFoods,
} from "../foods.ts";
import { macrosFor } from "../nutrition.ts";
import type { Food } from "../types.ts";

const food = (id: string, name: string, kcal: number): Food => ({
  id,
  name,
  per100g: { kcal, protein: 8, carbs: 55, fat: 12, fiber: 2 },
  measure: { unit: "laddoo", grams: 30 },
  tags: {},
  verified: false,
});

const reset = () => {
  registerCommunityFoods([]);
  registerCustomFoods([]);
};

test("shared foods join the lookup, are flagged, and can be cleared", () => {
  reset();
  registerCommunityFoods([food("cf_1", "Besan laddoo", 450)]);
  const f = FOOD_BY_ID.cf_1;
  assert.equal(f.community, true);
  assert.equal(f.verified, true);
  assert.ok(allFoods().some((x) => x.id === "cf_1"));
  registerCommunityFoods([]);
  assert.equal(FOOD_BY_ID.cf_1, undefined);
  assert.equal(allFoods().length, FOODS.length);
});

test("once a food is checked, the person's own copy shows the corrected values", () => {
  reset();
  // They typed 300 kcal per 100 g; the admin corrected it to 450.
  registerCustomFoods([food("c_a", "My laddoo", 300)]);
  assert.equal(Math.round(macrosFor(FOOD_BY_ID.c_a, 2).kcal), 180);

  registerCommunityFoods([food("cf_1", "Besan laddoo", 450)], { c_a: "cf_1" });
  assert.equal(
    FOOD_BY_ID.c_a.id,
    "cf_1",
    "old logs resolve to the checked food",
  );
  assert.equal(Math.round(macrosFor(FOOD_BY_ID.c_a, 2).kcal), 270);
  assert.ok(isReplacedByShared("c_a"));

  const ids = allFoods().map((x) => x.id);
  assert.ok(ids.includes("cf_1"));
  assert.ok(!ids.includes("c_a"), "the duplicate is hidden from search");

  // If the shared food goes away, their own copy comes back.
  registerCommunityFoods([], { c_a: "cf_1" });
  assert.equal(FOOD_BY_ID.c_a.id, "c_a");
  assert.ok(!isReplacedByShared("c_a"));
  assert.ok(allFoods().some((x) => x.id === "c_a"));
  reset();
});

test("registering own foods again keeps the swap in place", () => {
  reset();
  registerCommunityFoods([food("cf_1", "Besan laddoo", 450)], { c_a: "cf_1" });
  registerCustomFoods([food("c_a", "My laddoo", 300)]);
  assert.equal(FOOD_BY_ID.c_a.id, "cf_1");
  registerCustomFoods([]);
  reset();
});

test("an alias that points nowhere changes nothing", () => {
  reset();
  registerCustomFoods([food("c_b", "Mine", 200)]);
  registerCommunityFoods([], { c_b: "cf_missing" });
  assert.equal(FOOD_BY_ID.c_b.id, "c_b");
  assert.ok(allFoods().some((x) => x.id === "c_b"));
  reset();
});
