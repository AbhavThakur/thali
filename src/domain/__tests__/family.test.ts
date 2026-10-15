import assert from "node:assert/strict";
import { test } from "node:test";
import {
  familyStreakWeeks,
  familyWeek,
  formatInviteCode,
  isInviteCode,
  latestWeight,
  normalizeInviteCode,
  timeAgo,
  todayStatus,
  toFamilyDays,
  weekStart,
  type FamilyDay,
  type FamilyMember,
} from "../family.ts";
import type { HistoryDay } from "../history.ts";

const member = (userId: string, joinedOn = "2026-01-01"): FamilyMember => ({
  userId,
  name: userId,
  emoji: "🙂",
  shareWeight: false,
  joinedOn,
  streak: 0,
});
const day = (d: string, logged = true): FamilyDay => ({
  day: d,
  logged,
  stars: 0,
  meals: logged ? 3 : 0,
  waterOk: false,
  weightKg: null,
});
const hist = (over: Partial<HistoryDay>): HistoryDay => ({
  date: "2026-10-14",
  logged: true,
  totals: { kcal: 1800, protein: 70, carbs: 200, fat: 50, fiber: 20 },
  meals: [],
  stars: { stars: 2, allMeals: true, onTarget: true, protein: false },
  water: 8,
  weightKg: 70.4,
  ...over,
});

// 2026-10-14 is a Wednesday, so the week runs 2026-10-12 (Mon) to 2026-10-18 (Sun).
const WED = "2026-10-14";

test("weekStart is the Monday of the week", () => {
  assert.equal(weekStart("2026-10-12"), "2026-10-12");
  assert.equal(weekStart(WED), "2026-10-12");
  assert.equal(weekStart("2026-10-18"), "2026-10-12");
  assert.equal(weekStart("2026-10-19"), "2026-10-19");
});

test("invite codes ignore dashes, spaces and case", () => {
  assert.equal(normalizeInviteCode(" k7mq-4x9r "), "K7MQ4X9R");
  assert.equal(formatInviteCode("k7mq4x9r"), "K7MQ-4X9R");
  assert.ok(isInviteCode("K7MQ-4X9R"));
  assert.ok(!isInviteCode("K7MQ-4X9"));
  assert.ok(
    !isInviteCode("K7MQ-4X9O"),
    "O looks like zero and is never issued",
  );
});

test("shared days carry effort only, and weight only when allowed", () => {
  const meals = [
    { slot: "breakfast", label: "", kcal: 1, items: [] },
    { slot: "snack", label: "", kcal: 1, items: [] },
  ] as unknown as HistoryDay["meals"];
  const off = toFamilyDays([hist({ meals })], 8, false)[0];
  assert.equal(off.weightKg, null);
  assert.equal(off.meals, 1, "snacks don't count as a main meal");
  assert.equal(off.stars, 2);
  assert.equal(off.waterOk, true);
  assert.equal(toFamilyDays([hist({ meals })], 8, true)[0].weightKg, 70.4);
  assert.equal(
    toFamilyDays([hist({ water: 7, logged: false, stars: null })], 8, true)[0]
      .waterOk,
    false,
  );
  assert.ok(!("totals" in off) && !("kcal" in off));
});

test("today status", () => {
  assert.equal(todayStatus(undefined), "none");
  assert.equal(todayStatus(day(WED, false)), "none");
  assert.equal(todayStatus({ ...day(WED), meals: 1 }), "partial");
  assert.equal(todayStatus(day(WED)), "done");
});

test("family week needs everyone to hit the goal", () => {
  const members = [member("a"), member("b")];
  const days = new Map([
    ["a", ["2026-10-12", "2026-10-13", WED].map((d) => day(d))],
    ["b", ["2026-10-12"].map((d) => day(d))],
  ]);
  const w = familyWeek(members, days, WED, 3);
  assert.equal(w.start, "2026-10-12");
  assert.equal(w.daysLeft, 5);
  assert.deepEqual(
    w.members.map((m) => [m.userId, m.logged, m.done]),
    [
      ["a", 3, true],
      ["b", 1, false],
    ],
  );
  assert.equal(w.allDone, false);
  days.set(
    "b",
    ["2026-10-12", "2026-10-13", WED].map((d) => day(d)),
  );
  assert.equal(familyWeek(members, days, WED, 3).allDone, true);
});

test("a goal that can no longer be reached is flagged, not hidden", () => {
  const days = new Map([["a", [day("2026-10-12")]]]);
  const w = familyWeek([member("a")], days, "2026-10-17", 5); // Saturday, 1 of 5 logged
  assert.equal(w.members[0].reachable, false);
  assert.equal(
    familyWeek([member("a")], days, WED, 5).members[0].reachable,
    true,
  );
});

test("someone who joined mid-week only needs the days they were there", () => {
  const m = member("new", "2026-10-17"); // Saturday: 2 days left in the week
  const w = familyWeek(
    [m],
    new Map([["new", [day("2026-10-17"), day("2026-10-18")]]]),
    "2026-10-18",
    5,
  );
  assert.equal(w.members[0].required, 2);
  assert.equal(w.allDone, true);
  assert.equal(
    familyWeek([member("later", "2026-10-26")], new Map(), WED).members.length,
    0,
    "a member who joins next week isn't counted yet",
  );
});

test("family streak counts finished weeks in a row, then this week if won", () => {
  const members = [member("a"), member("b")];
  const full = (monday: string): string[] =>
    [0, 1, 2, 3, 4].map((n) =>
      new Date(Date.parse(`${monday}T00:00:00Z`) + n * 86_400_000)
        .toISOString()
        .slice(0, 10),
    );
  const week = (monday: string) => full(monday).map((d) => day(d));
  // Weeks of Sep 28 and Oct 5 are won by both; Sep 21 was missed by b.
  const days = new Map([
    [
      "a",
      [...week("2026-09-21"), ...week("2026-09-28"), ...week("2026-10-05")],
    ],
    ["b", [...week("2026-09-28"), ...week("2026-10-05")]],
  ]);
  assert.equal(familyStreakWeeks(members, days, WED), 2);
  days.set("a", [...(days.get("a") ?? []), ...week("2026-10-12")]);
  days.set("b", [...(days.get("b") ?? []), ...week("2026-10-12")]);
  assert.equal(familyStreakWeeks(members, days, "2026-10-17"), 3);
  assert.equal(familyStreakWeeks(members, new Map(), WED), 0);
});

test("times are shown the way people say them", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  assert.equal(timeAgo("2026-10-14T11:59:40Z", now), "just now");
  assert.equal(timeAgo("2026-10-14T11:20:00Z", now), "40 min ago");
  assert.equal(timeAgo("2026-10-14T07:00:00Z", now), "5 h ago");
  assert.equal(timeAgo("2026-10-13T10:00:00Z", now), "yesterday");
  assert.equal(timeAgo("2026-10-10T12:00:00Z", now), "4 days ago");
});

test("the latest shared weight wins, and none means none", () => {
  const w = (d: string, kg: number | null): FamilyDay => ({ ...day(d), weightKg: kg });
  assert.equal(latestWeight([w("2026-10-10", 70), w("2026-10-13", 69.2), w("2026-10-12", null)]), 69.2);
  assert.equal(latestWeight([w("2026-10-10", null)]), null);
  assert.equal(latestWeight(undefined), null);
});
