import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyFasting,
  endFast,
  fastProgress,
  fastStats,
  fastingAccess,
  formatDuration,
  parseFasting,
  startFast,
} from "../fasting.ts";
import { allFoods, FOOD_BY_ID, registerCustomFoods } from "../foods.ts";
import type { HistoryDay } from "../history.ts";
import { INGREDIENTS } from "../ingredients.ts";
import { describeServing, macrosFor } from "../nutrition.ts";
import { buildQuickFood } from "../quickAdd.ts";
import {
  buildRecipeFood,
  EMPTY_RECIPE,
  ingredientGrams,
  toRecipeInput,
} from "../recipe.ts";
import { repeatOffer } from "../repeat.ts";
import { lastWeighIn, parseWeight, weighInText } from "../weighIn.ts";
import { weekSummary } from "../week.ts";

// ---- Recipe builder ---------------------------------------------------------------------------

const dal = {
  ...EMPTY_RECIPE,
  name: "Amma's dal",
  items: [
    { foodId: "i_toor_dal", qty: 1 }, // 120 g raw
    { foodId: "i_oil", qty: 2 }, // 10 g
    { foodId: "i_onion", qty: 1 }, // 100 g
    { foodId: "i_tomato", qty: 1 }, // 80 g
  ],
  cookedGrams: "900",
  servings: "6",
};

test("raw ingredients resolve by id but are not offered in food search", () => {
  assert.ok(INGREDIENTS.length >= 30);
  assert.ok(FOOD_BY_ID.i_oil && FOOD_BY_ID.i_toor_dal);
  assert.ok(!allFoods().some((f) => f.id.startsWith("i_")));
  assert.equal(new Set(INGREDIENTS.map((f) => f.id)).size, INGREDIENTS.length);
  for (const f of INGREDIENTS) {
    const p = f.per100g;
    assert.ok(
      p.protein + p.carbs + p.fat <= 100.5,
      `${f.id} adds to over 100 g`,
    );
    assert.ok(p.fiber <= p.carbs, `${f.id} fiber above carbs`);
  }
});

test("a recipe is spread over the cooked weight and logged by the serving", () => {
  const built = buildRecipeFood(dal, "c_dal");
  assert.ok("food" in built);
  if (!("food" in built)) return;
  const f = built.food;
  assert.equal(f.measure.unit, "katori");
  assert.equal(f.measure.grams, 150);
  // About 590 kcal of ingredients in 900 g is roughly 98 kcal per 150 g serving.
  const kcal = macrosFor(f, 1).kcal;
  assert.ok(kcal > 88 && kcal < 108, `serving is ${kcal} kcal`);
  assert.deepEqual(f.tags, { rootVeg: true });
  assert.equal(f.recipe?.cookedGrams, 900);
  assert.equal(f.custom, true);
});

test("meat and dairy ingredients carry their tags into the dish", () => {
  const built = buildRecipeFood(
    {
      ...dal,
      items: [
        ...dal.items,
        { foodId: "i_chicken_raw", qty: 2 },
        { foodId: "i_butter", qty: 1 },
      ],
      cookedGrams: "1100",
    },
    "c_x",
  );
  assert.ok("food" in built && built.food.tags.meat && built.food.tags.dairy);
});

test("a recipe that makes no sense is refused with a reason", () => {
  const err = (over: Partial<typeof dal>) => {
    const r = buildRecipeFood({ ...dal, ...over }, "c_dal");
    return "error" in r ? r.error : "";
  };
  assert.match(err({ name: "x" }), /name/);
  assert.match(err({ items: [] }), /ingredient/);
  assert.match(err({ cookedGrams: "" }), /cooked weight/);
  assert.match(err({ cookedGrams: "40" }), /doesn't look right/);
  assert.match(err({ cookedGrams: "5000" }), /doesn't look right/);
  assert.match(err({ servings: "0" }), /servings/);
  assert.match(err({ unit: "" }), /serving/);
  assert.match(err({ items: [{ foodId: "i_oil", qty: 0 }] }), /quantity/);
  assert.ok(ingredientGrams(dal.items) === 310);
});

test("a saved recipe can be opened again", () => {
  const built = buildRecipeFood(dal, "c_dal");
  if (!("food" in built)) throw new Error("expected a food");
  const back = toRecipeInput(built.food);
  assert.equal(back?.cookedGrams, "900");
  assert.equal(back?.servings, "6");
  assert.deepEqual(back?.items, dal.items);
  assert.equal(toRecipeInput({ ...built.food, recipe: undefined }), null);
});

// ---- Quick add --------------------------------------------------------------------------------

test("quick add logs the calories as typed and stays out of search", () => {
  const built = buildQuickFood(
    { name: "", kcal: "450", protein: "", carbs: "", fat: "" },
    "q_1",
  );
  assert.ok("food" in built);
  if (!("food" in built)) return;
  assert.equal(built.food.name, "Quick add");
  assert.equal(Math.round(macrosFor(built.food, 1).kcal), 450);
  assert.equal(Math.round(macrosFor(built.food, 2).kcal), 900);
  assert.equal(describeServing(built.food, 1), "quick add");

  registerCustomFoods([built.food]);
  assert.ok(FOOD_BY_ID.q_1, "old logs still resolve");
  assert.ok(!allFoods().some((f) => f.id === "q_1"));
  registerCustomFoods([]);
});

test("quick add keeps macros and refuses numbers that don't fit", () => {
  const ok = buildQuickFood(
    {
      name: "Restaurant biryani",
      kcal: "650",
      protein: "20",
      carbs: "90",
      fat: "22",
    },
    "q_2",
  );
  assert.ok("food" in ok && ok.food.name === "Restaurant biryani");
  if ("food" in ok) assert.equal(Math.round(macrosFor(ok.food, 1).protein), 20);
  const bad = (kcal: string, protein = "", carbs = "", fat = "") => {
    const r = buildQuickFood({ name: "", kcal, protein, carbs, fat }, "q_3");
    return "error" in r;
  };
  assert.ok(bad(""));
  assert.ok(bad("0"));
  assert.ok(bad("abc"));
  assert.ok(
    bad("100", "50", "50", "50"),
    "macros that don't match the calories",
  );
});

// ---- Repeat -----------------------------------------------------------------------------------

test("repeating gives the entries and their calories, or nothing", () => {
  const logs = [
    { slot: "lunch" as const, food_id: "roti", qty: 2 },
    { slot: "lunch" as const, food_id: "dal_tadka", qty: 1 },
    { slot: "dinner" as const, food_id: "khichdi", qty: 1 },
    { slot: "snack" as const, food_id: "gone_food", qty: 1 },
  ];
  const lunch = repeatOffer(logs, "lunch");
  assert.equal(lunch?.entries.length, 2);
  assert.equal(Math.round(lunch?.kcal ?? 0), Math.round(264 * 0.8 + 105 * 1.5));
  assert.equal(
    repeatOffer(logs)?.entries.length,
    3,
    "a removed food is skipped",
  );
  assert.equal(repeatOffer(logs, "snack"), null);
  assert.equal(repeatOffer([], "lunch"), null);
});

// ---- Weight -----------------------------------------------------------------------------------

test("weights are checked and rounded", () => {
  assert.equal(parseWeight("72.46"), 72.5);
  assert.equal(parseWeight(" 72,4 "), 72.4);
  assert.equal(parseWeight("29"), null);
  assert.equal(parseWeight("251"), null);
  assert.equal(parseWeight("abc"), null);
  assert.equal(parseWeight(""), null);
});

test("the last weigh-in says how long ago it was", () => {
  const w = [
    { date: "2026-10-10", kg: 73 },
    { date: "2026-10-14", kg: 72.4 },
  ];
  assert.deepEqual(lastWeighIn(w, "2026-10-17"), {
    kg: 72.4,
    date: "2026-10-14",
    daysAgo: 3,
  });
  assert.equal(
    weighInText(lastWeighIn(w, "2026-10-17")),
    "72.4 kg · 3 days ago",
  );
  assert.equal(weighInText(lastWeighIn(w, "2026-10-14")), "72.4 kg · today");
  assert.equal(
    weighInText(lastWeighIn(w, "2026-10-15")),
    "72.4 kg · yesterday",
  );
  assert.equal(
    weighInText(lastWeighIn([], "2026-10-17")),
    "Log your first weigh-in",
  );
});

// ---- Weekly view ------------------------------------------------------------------------------

const day = (date: string, kcal: number | null): HistoryDay =>
  ({
    date,
    logged: kcal != null,
    totals: { kcal: kcal ?? 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    meals: [],
    stars: null,
    water: 0,
    weightKg: null,
  }) as HistoryDay;

// 2026-10-12 is a Monday; Friday the 16th is "today".
const week = (kcals: (number | null)[], target = 1800, to = "2026-10-16") =>
  weekSummary(
    kcals.map((k, i) => day(`2026-10-${12 + i}`, k)),
    target,
    to,
  );

test("the week runs Monday to Sunday and marks today and the future", () => {
  const w = week([1800, 1900, null, 1700, 800]);
  assert.equal(w.from, "2026-10-12");
  assert.deepEqual(
    w.days.map((d) => d.label),
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  );
  assert.deepEqual(
    w.days.map((d) => d.state),
    ["on", "on", "none", "on", "under", "future", "future"],
  );
  assert.equal(w.days[4].isToday, true);
  assert.equal(w.countedDays, 3, "today is not counted until it is over");
  assert.equal(w.avgKcal, 1800);
});

test("one bigger day is fine when the week averages close to target", () => {
  const w = week([1800, 2300, 1700, 1750]);
  assert.equal(w.days[1].state, "over");
  assert.equal(w.insight.tone, "good");
  assert.match(w.insight.text, /One bigger day/);
});

test("a week well above target is told to swap, never to skip meals", () => {
  const w = week([2400, 2400, 2300, 2500]);
  assert.equal(w.insight.tone, "warn");
  assert.match(w.insight.text, /above target/);
  assert.match(w.insight.text, /no need to skip meals/);
  assert.ok(w.diffPct > 10);
});

test("a week well below target is never praised", () => {
  const w = week([1200, 1100, 1300, 1200]);
  assert.equal(w.insight.tone, "warn");
  assert.match(w.insight.text, /below/);
  assert.ok(w.diffPct < -10);
});

test("a day with meals missing is not judged, so a half-logged day can't look like undereating", () => {
  const h = [day("2026-10-12", 1800), { ...day("2026-10-13", 300), complete: false }, day("2026-10-14", 1850)];
  const w = weekSummary(h, 1800, "2026-10-16");
  assert.equal(w.countedDays, 2);
  assert.equal(w.avgKcal, 1825);
  assert.equal(w.insight.tone, "good");
  assert.equal(w.days[1].state, "under", "the bar still shows what was logged");
});

test("with nothing finished yet it just invites logging", () => {
  const w = week([null, null, null, null, 500]);
  assert.equal(w.countedDays, 0);
  assert.equal(w.insight.tone, "info");
  assert.equal(w.avgKcal, 0);
});

// ---- Fasting ----------------------------------------------------------------------------------

const H = 3_600_000;

test("a fast starts, runs and ends into the history", () => {
  const s0 = emptyFasting();
  const s1 = startFast(s0, 1000, 16);
  assert.deepEqual(s1.active, { start: 1000, goalHours: 16 });
  assert.equal(startFast(s1, 5000, 12), s1, "a second start changes nothing");
  const s2 = endFast(s1, 1000 + 17 * H);
  assert.equal(s2.active, null);
  assert.equal(s2.history.length, 1);
  assert.equal(
    endFast(s2, 9999),
    s2,
    "ending with nothing running changes nothing",
  );
});

test("a mis-tap is not kept, and the goal stays between 1 and 24 hours", () => {
  assert.equal(
    endFast(startFast(emptyFasting(), 0, 16), 60_000).history.length,
    0,
  );
  assert.equal(startFast(emptyFasting(), 0, 99).active?.goalHours, 24);
  assert.equal(startFast(emptyFasting(), 0, 0).active?.goalHours, 1);
});

test("progress shows time left, completion and when it has gone on too long", () => {
  const active = { start: 0, goalHours: 16 };
  const half = fastProgress(active, 8 * H);
  assert.equal(half.done, false);
  assert.equal(half.ratio, 0.5);
  assert.equal(half.remaining, 8 * H);
  assert.equal(fastProgress(active, 16 * H).done, true);
  assert.equal(fastProgress(active, 16 * H).tooLong, false);
  assert.equal(fastProgress(active, 25 * H).tooLong, true);
  assert.equal(fastProgress(active, 25 * H).ratio, 1);
});

test("durations and the weekly summary read well", () => {
  assert.equal(formatDuration(14 * H + 5 * 60_000), "14h 05m");
  assert.equal(formatDuration(35 * 60_000), "35m");
  assert.equal(formatDuration(-5), "0m");
  const now = 10 * 24 * H;
  const history = [
    { start: 0, end: 16 * H, goalHours: 16 }, // older than a week
    { start: now - 40 * H, end: now - 22 * H, goalHours: 16 }, // 18 h, reached
    { start: now - 20 * H, end: now - 10 * H, goalHours: 14 }, // 10 h, not reached
  ];
  const st = fastStats(history, now);
  assert.equal(st.count, 2);
  assert.equal(st.reached, 1);
  assert.equal(st.avgHours, 14);
  assert.equal(st.longestHours, 18);
});

test("saved fasting data that is damaged becomes empty instead of breaking the screen", () => {
  assert.deepEqual(parseFasting(null), emptyFasting());
  assert.deepEqual(parseFasting("{nope"), emptyFasting());
  const s = parseFasting(
    JSON.stringify({
      active: { start: "x" },
      history: [
        { start: 1, end: 2, goalHours: 16 },
        { start: 5, end: 3, goalHours: 16 },
        null,
      ],
    }),
  );
  assert.equal(s.active, null);
  assert.equal(s.history.length, 1);
});

test("fasting is not offered to people it could harm", () => {
  const none = { pregnant: false, ed: false, medical: false, none: true };
  assert.deepEqual(fastingAccess(none, 30), { ok: true, caution: null });
  assert.deepEqual(fastingAccess(null, 30), { ok: true, caution: null });
  assert.equal(fastingAccess(none, 17).ok, false);
  assert.equal(fastingAccess({ ...none, pregnant: true }, 30).ok, false);
  assert.equal(fastingAccess({ ...none, ed: true }, 30).ok, false);
  const med = fastingAccess({ ...none, medical: true }, 30);
  assert.ok(med.ok && /doctor/.test(med.caution ?? ""));
});
