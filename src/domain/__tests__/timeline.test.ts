import assert from "node:assert/strict";
import { test } from "node:test";
import { calorieTarget, MIN_KCAL } from "../energy.ts";
import {
  addWeeks,
  formatDay,
  maxWeeklyRate,
  planForWeeks,
  rateForWeeks,
  recommendedRate,
  timelineFor,
  timelinePresets,
  weeksForRate,
  weeksUntil,
} from "../timeline.ts";
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
const thinMan: Profile = {
  ...woman,
  sex: "male",
  heightCm: 178,
  weightKg: 52,
  targetWeightKg: 60,
  goal: "gain",
};
const TODAY = "2026-10-15";

test("dates are added, counted and shown the way people read them", () => {
  assert.equal(addWeeks(TODAY, 2), "2026-10-29");
  assert.equal(addWeeks("2026-12-20", 2), "2027-01-03");
  assert.equal(weeksUntil("2026-10-29", TODAY), 2);
  assert.equal(
    weeksUntil("2026-10-30", TODAY),
    3,
    "part of a week counts as a week",
  );
  assert.equal(weeksUntil("2026-10-01", TODAY), 0);
  assert.equal(formatDay("2026-12-07"), "7 Dec 2026");
});

test("nothing to schedule when staying healthy, at the target, or when gaining is not advised", () => {
  assert.equal(timelineFor({ ...woman, goal: "maintain" }), null);
  assert.equal(timelineFor({ ...woman, targetWeightKg: 70 }), null);
  assert.equal(
    timelineFor({ ...woman, targetWeightKg: 75 }),
    null,
    "target above weight is not a loss",
  );
  assert.equal(
    timelineFor({
      ...thinMan,
      weightKg: 85,
      targetWeightKg: 90,
      heightCm: 170,
    }),
    null,
    "BMI 25 or more: calories are held at maintenance",
  );
});

test("weight loss: the safe limit sets the earliest date and the recommendation sits below it", () => {
  const t = timelineFor(woman);
  assert.ok(t);
  assert.ok(t.maxRateKg <= 0.7, `70 kg person: ${t.maxRateKg}`);
  assert.equal(t.changeKg, 10);
  assert.equal(t.minWeeks, Math.ceil(10 / t.maxRateKg));
  assert.ok(t.minWeeks < t.recommendedWeeks && t.recommendedWeeks < t.maxWeeks);
  assert.ok(
    10 / t.recommendedWeeks <= 0.5,
    "never recommends faster than 0.5 kg a week",
  );
});

test("the suggested pace follows BMI: more to lose allows a faster pace, close to healthy goes slowly", () => {
  const at = (weightKg: number): Profile => ({
    ...woman,
    sex: "male",
    heightCm: 175,
    age: 35,
    activity: "moderate",
    weightKg,
    targetWeightKg: weightKg - 5,
  });
  // Asian cut-offs: BMI 23 overweight, 25 obese.
  assert.equal(recommendedRate(at(100)), 0.75, "BMI 32.7");
  assert.equal(recommendedRate(at(73)), 0.5, "BMI 23.8");
  assert.equal(recommendedRate(at(65)), 0.35, "BMI 21.2");
  assert.equal(
    recommendedRate(thinMan),
    0.4,
    "underweight gains a little faster",
  );
  assert.equal(recommendedRate({ ...thinMan, goal: "muscle" }), 0.25);
  // The suggested date really is slower for the lighter person (same 5 kg to lose).
  const heavy = timelineFor(at(100));
  const light = timelineFor(at(65));
  assert.ok(heavy && light && heavy.recommendedWeeks < light.recommendedWeeks);
});

test("the suggestion never exceeds 85% of the safe maximum", () => {
  const t = timelineFor(woman);
  assert.ok(t);
  assert.ok(10 / t.recommendedWeeks <= t.maxRateKg * 0.85 + 0.02);
  assert.ok(t.recommendedWeeks > t.minWeeks);
});

test("a date turns into a pace that lands on it, and never goes past the safe maximum", () => {
  const t = timelineFor(woman);
  assert.ok(t);
  const w = t.recommendedWeeks;
  assert.equal(rateForWeeks(t, w), Math.round((10 / w) * 100) / 100);
  assert.equal(
    rateForWeeks(t, 1),
    rateForWeeks(t, t.minWeeks),
    "an impossible date is held at the fastest safe date",
  );
  assert.ok(rateForWeeks(t, 1) <= t.maxRateKg);
  assert.equal(
    weeksForRate(t, 0.5),
    t.minWeeks,
    "a saved pace above the limit becomes the earliest date",
  );
  assert.equal(weeksForRate(t, t.maxRateKg), t.minWeeks);
});

test("every offered date gives calories that respect the safety rules", () => {
  const people: Profile[] = [
    woman,
    {
      ...woman,
      weightKg: 48,
      targetWeightKg: 46,
      heightCm: 158,
      age: 60,
      activity: "sedentary",
    },
    {
      ...woman,
      sex: "male",
      weightKg: 110,
      targetWeightKg: 80,
      heightCm: 178,
      age: 45,
      activity: "moderate",
    },
    {
      ...woman,
      weightKg: 55,
      targetWeightKg: 50,
      heightCm: 150,
      age: 75,
      activity: "sedentary",
    },
    thinMan,
    { ...thinMan, goal: "muscle" },
  ];
  for (const p of people) {
    const t = timelineFor(p);
    if (!t) continue;
    for (const weeks of [t.minWeeks, t.recommendedWeeks, t.maxWeeks]) {
      const plan = planForWeeks(p, weeks, TODAY);
      assert.ok(plan);
      const target = calorieTarget(plan.profile);
      const label = `${p.sex} ${p.weightKg}kg ${p.goal} ${weeks}w`;
      assert.equal(
        target.clampedToFloor,
        false,
        `${label} was held at the floor`,
      );
      assert.ok(target.kcal >= MIN_KCAL[p.sex], label);
      assert.ok(target.deficit <= target.tdee * 0.25 + 1, label);
      assert.ok(plan.rateKg <= t.maxRateKg, label);
      // The pace is what the calorie target actually uses.
      const expected = p.goal === "lose" ? target.deficit : target.surplus;
      assert.ok(Math.abs(expected - (plan.rateKg * 7700) / 7) <= 2, label);
    }
  }
});

test("weight gain is capped lower for muscle building than for plain gain", () => {
  const gain = maxWeeklyRate(thinMan);
  const muscle = maxWeeklyRate({ ...thinMan, goal: "muscle" });
  assert.ok(gain <= 0.5 && muscle <= gain && muscle > 0, `${gain} / ${muscle}`);
  const t = timelineFor(thinMan);
  assert.ok(t);
  assert.ok(
    8 / t.recommendedWeeks <= 0.4 && t.recommendedWeeks <= 40,
    `${t.recommendedWeeks} weeks`,
  );
});

test("a small person whose maintenance sits just above the calorie floor gets a long timeline, not a crash diet", () => {
  const tiny: Profile = {
    ...woman,
    weightKg: 50,
    targetWeightKg: 47,
    heightCm: 150,
    age: 60,
    activity: "light",
  };
  const t = timelineFor(tiny);
  assert.ok(t);
  assert.ok(t.maxRateKg < 0.2, `max ${t.maxRateKg}`);
  const plan = planForWeeks(tiny, t.minWeeks, TODAY);
  assert.ok(plan);
  assert.ok(calorieTarget(plan.profile).kcal >= 1200);
});

test("nobody is scheduled for a deficit when maintenance is already below the calorie floor", () => {
  const tiny: Profile = {
    ...woman,
    weightKg: 45,
    targetWeightKg: 42,
    heightCm: 145,
    age: 78,
    activity: "sedentary",
  };
  assert.equal(maxWeeklyRate(tiny), 0);
  assert.equal(timelineFor(tiny), null);
});

test("presets are distinct, soonest first, and recommended is among them", () => {
  const presets = timelinePresets(woman, TODAY);
  assert.deepEqual(
    presets.map((p) => p.id),
    ["fast", "steady", "relaxed"],
  );
  const weeks = presets.map((p) => p.weeks);
  assert.deepEqual(
    [...weeks].sort((a, b) => a - b),
    weeks,
  );
  assert.equal(new Set(weeks).size, weeks.length);
  assert.equal(
    presets[1].date,
    addWeeks(TODAY, timelineFor(woman)?.recommendedWeeks ?? -1),
  );
  assert.ok(
    presets[0].kcal < presets[1].kcal && presets[1].kcal < presets[2].kcal,
    "slower means more food",
  );
  assert.deepEqual(timelinePresets({ ...woman, goal: "maintain" }, TODAY), []);
});

test("planning stamps the date and pace onto the profile without touching the other pace", () => {
  const t = timelineFor(woman);
  assert.ok(t);
  const plan = planForWeeks(woman, t.recommendedWeeks, TODAY);
  assert.ok(plan);
  assert.equal(plan.profile.targetDate, addWeeks(TODAY, t.recommendedWeeks));
  assert.equal(plan.profile.weeklyLossKg, rateForWeeks(t, t.recommendedWeeks));
  assert.equal(plan.profile.weeklyGainKg, woman.weeklyGainKg);
  const tg = timelineFor(thinMan);
  assert.ok(tg);
  const gain = planForWeeks(thinMan, tg.recommendedWeeks, TODAY);
  assert.ok(gain);
  assert.equal(
    gain.profile.weeklyGainKg,
    rateForWeeks(tg, tg.recommendedWeeks),
  );
  assert.equal(gain.profile.weeklyLossKg, thinMan.weeklyLossKg);
});
