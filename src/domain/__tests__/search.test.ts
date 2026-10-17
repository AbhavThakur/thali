import assert from "node:assert/strict";
import { test } from "node:test";
import { allFoods } from "../foods.ts";
import { matchesQuery, normalize, searchFoods } from "../search.ts";

test("spelling variants look the same", () => {
  assert.equal(normalize("Daal"), normalize("dhal"));
  assert.equal(normalize("chhole"), normalize("Chole"));
  assert.equal(normalize("Chapatti"), normalize("chapati"));
});

test("a food is found by its common other names", () => {
  assert.ok(matchesQuery("Whole wheat roti (phulka)", "chapati"));
  assert.ok(matchesQuery("Dal tadka (toor)", "daal"));
  assert.ok(matchesQuery("Dal tadka (toor)", "lentil"));
  assert.ok(matchesQuery("Chole (chickpea curry)", "chhole"));
  assert.ok(matchesQuery("Aloo sabzi", "potato sabji"));
});

test("every word has to match", () => {
  assert.ok(!matchesQuery("Aloo sabzi", "aloo paneer"));
  assert.ok(!matchesQuery("Idli", "dosa"));
});

test("search ranks names that start with the query first", () => {
  const names = searchFoods(allFoods(), "dal").map((f) => f.name);
  assert.ok(names.length > 1);
  const firstOther = names.findIndex((n) => !/^dal/i.test(n));
  assert.ok(
    names.slice(firstOther).every((n) => !/^dal/i.test(n)),
    "all names starting with dal come before the others",
  );
});

test("an empty query returns everything", () => {
  assert.equal(searchFoods(allFoods(), "  ").length, allFoods().length);
});

test("chapati finds the roti in the real food list", () => {
  assert.ok(
    searchFoods(allFoods(), "chapati").some((f) => /roti/i.test(f.name)),
  );
});
