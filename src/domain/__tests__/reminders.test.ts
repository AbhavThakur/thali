import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_REMINDERS,
  MAX_PENDING,
  planReminders,
  shiftTime,
  type ReminderPrefs,
  type TodayState,
} from "../reminders.ts";

const on: ReminderPrefs = { ...DEFAULT_REMINDERS, enabled: true };
const fresh: TodayState = { loggedSlots: [], water: 0, weighedToday: false };
// Wednesday 15 Oct 2026, 07:00 local
const morning = new Date(2026, 9, 15, 7, 0);
const todayIds = (list: { id: string }[]) =>
  list.filter((r) => r.id.endsWith("2026-10-15")).map((r) => r.id);

test("nothing is scheduled when reminders are off", () => {
  assert.deepEqual(planReminders(DEFAULT_REMINDERS, morning, fresh, 8), []);
});

test("reminders are in the future, sorted, unique and capped", () => {
  const list = planReminders(
    { ...on, waterEveryHours: 1 },
    morning,
    fresh,
    8,
    7,
  );
  assert.ok(list.length <= MAX_PENDING);
  assert.ok(list.every((r) => r.at > morning.getTime()));
  assert.ok(list.every((r, i) => i === 0 || list[i - 1].at <= r.at));
  assert.equal(new Set(list.map((r) => r.id)).size, list.length);
});

test("a meal already logged today is not reminded today, but is tomorrow", () => {
  const list = planReminders(
    on,
    morning,
    { ...fresh, loggedSlots: ["breakfast"] },
    8,
  );
  assert.ok(!todayIds(list).includes("meal-breakfast-2026-10-15"));
  assert.ok(list.some((r) => r.id === "meal-breakfast-2026-10-16"));
});

test("times already past today are skipped", () => {
  const list = planReminders(on, new Date(2026, 9, 15, 14, 0), fresh, 8);
  assert.ok(!todayIds(list).includes("meal-lunch-2026-10-15"));
  assert.ok(todayIds(list).includes("meal-dinner-2026-10-15"));
});

test("water reminders stop for today once the goal is met", () => {
  const list = planReminders(on, morning, { ...fresh, water: 8 }, 8);
  assert.ok(!todayIds(list).some((id) => id.startsWith("water")));
  assert.ok(
    list.some((r) => r.id.startsWith("water") && r.id.endsWith("2026-10-16")),
  );
});

test("water every 2 hours from 9:00 to 20:00 gives 6 reminders a day", () => {
  const list = planReminders(
    { ...on, meals: false, evening: false, weighIn: false },
    morning,
    fresh,
    8,
    1,
  );
  assert.equal(list.length, 6);
});

test("evening nudge is skipped when all main meals are logged", () => {
  const all = planReminders(
    on,
    morning,
    { ...fresh, loggedSlots: ["breakfast", "lunch", "dinner"] },
    8,
  );
  assert.ok(!todayIds(all).includes("evening-2026-10-15"));
});

test("weigh-in only on the chosen weekday", () => {
  const list = planReminders({ ...on, weighInDay: 4 }, morning, fresh, 8, 7);
  const weigh = list.filter((r) => r.id.startsWith("weigh"));
  assert.equal(weigh.length, 1);
  assert.equal(new Date(weigh[0].at).getDay(), 4);
});

test("shiftTime wraps around midnight", () => {
  assert.equal(shiftTime("23:45", 30), "00:15");
  assert.equal(shiftTime("00:10", -15), "23:55");
});
