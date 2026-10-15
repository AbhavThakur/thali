import assert from "node:assert/strict";
import { test } from "node:test";
import { loggingStreak } from "../streak.ts";

test("counts consecutive days ending today", () => {
  assert.equal(
    loggingStreak(["2026-10-12", "2026-10-13", "2026-10-14"], "2026-10-14"),
    3,
  );
});

test("an unlogged today keeps yesterday's streak alive", () => {
  assert.equal(loggingStreak(["2026-10-12", "2026-10-13"], "2026-10-14"), 2);
});

test("a gap breaks the streak", () => {
  assert.equal(loggingStreak(["2026-10-11", "2026-10-14"], "2026-10-14"), 1);
  assert.equal(loggingStreak(["2026-10-11"], "2026-10-14"), 0);
});

test("crosses month boundaries", () => {
  assert.equal(loggingStreak(["2026-09-30", "2026-10-01"], "2026-10-01"), 2);
});
