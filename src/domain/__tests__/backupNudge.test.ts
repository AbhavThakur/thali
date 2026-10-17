import assert from "node:assert/strict";
import { test } from "node:test";
import { backupNudge, snoozeUntil, type NudgeInput } from "../backupNudge.ts";

const NOW = Date.parse("2026-10-17T10:00:00Z");
const base: NudgeInput = {
  signedIn: false,
  ownFoods: 0,
  loggedDays: 0,
  streak: 0,
  snoozedUntil: null,
  now: NOW,
};

test("nothing to lose yet means no nudge", () => {
  assert.equal(backupNudge(base), null);
  assert.equal(backupNudge({ ...base, loggedDays: 2, streak: 2 }), null);
});

test("signed-in phones are never nudged", () => {
  assert.equal(
    backupNudge({ ...base, signedIn: true, ownFoods: 3, streak: 30 }),
    null,
  );
});

test("the reasons, in order of how much would be lost", () => {
  assert.equal(backupNudge({ ...base, loggedDays: 3 })?.reason, "three_days");
  assert.equal(
    backupNudge({ ...base, loggedDays: 9, streak: 7 })?.reason,
    "streak",
  );
  assert.match(
    backupNudge({ ...base, loggedDays: 9, streak: 12 })?.title ?? "",
    /12-day streak/,
  );
  assert.equal(
    backupNudge({ ...base, loggedDays: 9, streak: 12, ownFoods: 1 })?.reason,
    "own_food",
  );
});

test("'Not now' keeps it quiet, for longer each time", () => {
  const busy = { ...base, ownFoods: 1 };
  assert.ok(backupNudge(busy));
  const day = 86_400_000;
  assert.equal(snoozeUntil(NOW, 0), NOW + 2 * day);
  assert.equal(snoozeUntil(NOW, 1), NOW + 5 * day);
  assert.equal(snoozeUntil(NOW, 2), NOW + 14 * day);
  assert.equal(snoozeUntil(NOW, 9), NOW + 14 * day);
  assert.equal(backupNudge({ ...busy, snoozedUntil: NOW + day }), null);
  assert.ok(backupNudge({ ...busy, snoozedUntil: NOW - 1 }));
});
