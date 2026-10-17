import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoDecide,
  checkValues,
  nameSimilarity,
  planDecisions,
  reviewFood,
  type Candidate,
  type Row,
} from "../foodReview.ts";

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  id: "p1",
  name: "Besan laddoo",
  unit: "laddoo",
  grams: 30,
  kcal: 450,
  protein: 9,
  carbs: 50,
  fat: 24,
  fiber: 3,
  tags: {},
  ...over,
});

const row = (over: Partial<Row> = {}): Row => ({
  ...cand(),
  status: "pending",
  canonical_id: null,
  ...over,
});

const rows = (...list: Row[]) => new Map(list.map((r) => [r.id, r]));

test("sensible values pass the review", () => {
  const r = reviewFood(cand(), []);
  assert.equal(r.verdict, "ok");
  assert.equal(r.perServing.kcal, 135);
  assert.equal(r.suggestedKcal, undefined);
});

test("calories that don't match the macros get a suggested fix", () => {
  // 9 g protein, 50 g carbs (3 fiber), 24 g fat is about 430 kcal; 900 is far off.
  const r = reviewFood(cand({ kcal: 800 }), []);
  assert.equal(r.verdict, "fix");
  assert.equal(r.suggestedKcal, 36 + 188 + 6 + 216);
  assert.ok(r.findings[0].message.includes("add up to"));
});

test("junk names, odd servings and missing macros are flagged", () => {
  assert.equal(reviewFood(cand({ name: "asdf" }), []).verdict, "fix");
  assert.equal(reviewFood(cand({ name: "aaaaa" }), []).verdict, "fix");
  assert.ok(reviewFood(cand({ grams: 900 }), []).findings.length > 0);
  const none = reviewFood(cand({ protein: 0, carbs: 0, fat: 0, fiber: 0 }), []);
  assert.ok(none.findings.some((f) => /no protein/.test(f.message)));
});

test("duplicates are found by name, even reworded, with the calorie gap", () => {
  const refs = [
    { id: "a", name: "Besan Laddoo", kcal: 440, source: "shared" as const },
    { id: "b", name: "Paneer tikka", kcal: 250, source: "built-in" as const },
  ];
  const r = reviewFood(cand(), refs);
  assert.equal(r.duplicates.length, 1);
  assert.equal(r.duplicates[0].id, "a");
  assert.equal(r.duplicates[0].kcalDiffPct, 2);
  assert.ok(nameSimilarity("Dal tadka", "Tadka dal") === 1);
  assert.ok(nameSimilarity("Dal tadka", "Rajma") === 0);
});

test("limits match the database", () => {
  assert.equal(checkValues(cand()), null);
  assert.match(checkValues(cand({ kcal: 901 })) ?? "", /kcal/);
  assert.match(checkValues(cand({ fiber: 60 })) ?? "", /fiber/);
  assert.match(
    checkValues(cand({ protein: 60, carbs: 30, fat: 20 })) ?? "",
    /over 100/,
  );
  assert.match(checkValues(cand({ name: "x" })) ?? "", /name/);
});

test("approving with corrections patches the values and marks the change", () => {
  const { plans, errors } = planDecisions(
    [
      {
        id: "p1",
        action: "approve",
        values: { kcal: 430 },
        note: "Fixed calories",
      },
    ],
    rows(row()),
    "NOW",
  );
  assert.deepEqual(errors, []);
  assert.equal(plans[0].requires, "pending");
  assert.equal(plans[0].patch.status, "approved");
  assert.equal(plans[0].patch.kcal, 430);
  assert.equal(plans[0].patch.changed_by_admin, true);
  assert.equal(plans[0].patch.admin_note, "Fixed calories");
  assert.equal(plans[0].patch.reviewed_at, "NOW");
});

test("approving as is does not claim a correction", () => {
  const { plans } = planDecisions(
    [{ id: "p1", action: "approve" }],
    rows(row()),
  );
  assert.equal(plans[0].patch.changed_by_admin, false);
});

test("a correction that breaks the limits is refused before anything is written", () => {
  const { plans, errors } = planDecisions(
    [{ id: "p1", action: "approve", values: { kcal: 5000 } }],
    rows(row()),
  );
  assert.equal(plans.length, 0);
  assert.match(errors[0], /kcal/);
  const bad = planDecisions(
    [{ id: "p1", action: "approve", values: { flavour: "x" } as never }],
    rows(row()),
  );
  assert.match(bad.errors[0], /unknown field/);
});

test("rejecting needs a note; merging needs an approved target", () => {
  const all = rows(
    row(),
    row({ id: "a1", status: "approved" }),
    row({ id: "p2", name: "Junk" }),
  );
  assert.match(
    planDecisions([{ id: "p2", action: "reject", note: "" }], all).errors[0],
    /note/,
  );
  const rej = planDecisions(
    [{ id: "p2", action: "reject", note: "Not a food" }],
    all,
  );
  assert.equal(rej.plans[0].patch.status, "rejected");

  const merged = planDecisions(
    [{ id: "p1", action: "merge", into: "a1" }],
    all,
  );
  assert.equal(merged.plans[0].patch.canonical_id, "a1");
  assert.equal(merged.plans[0].patch.status, "approved");
  assert.match(
    planDecisions([{ id: "p1", action: "merge", into: "p2" }], all).errors[0],
    /not an approved/,
  );
  assert.match(
    planDecisions([{ id: "p1", action: "merge", into: "p1" }], all).errors[0],
    /not an approved/,
  );
});

test("fixing a shared food needs it to be approved, and closes its reports", () => {
  const all = rows(row({ id: "a1", status: "approved" }), row());
  const up = planDecisions(
    [{ id: "a1", action: "update", values: { kcal: 400 } }],
    all,
  );
  assert.equal(up.plans[0].requires, "approved");
  assert.equal(up.plans[0].resolveReports, true);
  assert.equal(up.plans[0].patch.status, undefined, "status stays as it is");
  assert.match(
    planDecisions([{ id: "p1", action: "update", values: { kcal: 400 } }], all)
      .errors[0],
    /approved/,
  );
  assert.match(
    planDecisions([{ id: "a1", action: "update", values: {} }], all).errors[0],
    /no values/,
  );
  const dismiss = planDecisions([{ id: "a1", action: "dismiss" }], all);
  assert.deepEqual(dismiss.plans[0].patch, {});
});

test("unknown foods, repeats and bad files are errors", () => {
  const all = rows(row());
  assert.match(
    planDecisions([{ id: "zzz", action: "approve" }], all).errors[0],
    /no such food/,
  );
  assert.match(
    planDecisions(
      [
        { id: "p1", action: "approve" },
        { id: "p1", action: "reject", note: "x" },
      ],
      all,
    ).errors[0],
    /twice/,
  );
  assert.match(planDecisions({}, all).errors[0], /list/);
  assert.match(
    planDecisions([{ id: "p1", action: "explode" } as never], all).errors[0],
    /unknown action/,
  );
});

const auto = (c: Candidate, refs: Parameters<typeof reviewFood>[1] = []) =>
  autoDecide([{ food: c, review: reviewFood(c, refs) }]);

test("auto: a clean food is approved as it is", () => {
  const { decisions, needsHuman } = auto(cand());
  assert.deepEqual(decisions, [{ id: "p1", action: "approve" }]);
  assert.equal(needsHuman.length, 0);
});

test("auto: calories that disagree with the macros are corrected, with a note", () => {
  const { decisions } = auto(cand({ kcal: 560 }));
  assert.equal(decisions[0].action, "approve");
  const d = decisions[0] as Extract<(typeof decisions)[number], { action: "approve" }>;
  assert.equal(d.values?.kcal, 36 + 188 + 6 + 216);
  assert.match(d.note ?? "", /corrected/i);
});

test("auto: junk names are refused with a note the person sees", () => {
  const { decisions } = auto(cand({ name: "asdf" }));
  assert.equal(decisions[0].action, "reject");
  assert.match((decisions[0] as { note: string }).note, /food name/);
});

test("auto: the same food as a shared one is merged, a built-in one is refused, a different one waits", () => {
  const shared = { id: "a1", name: "Besan laddoo", kcal: 445, source: "shared" as const };
  assert.deepEqual(auto(cand(), [shared]).decisions[0], { id: "p1", action: "merge", into: "a1" });

  const built = { ...shared, id: "dal", source: "built-in" as const };
  assert.equal(auto(cand(), [built]).decisions[0].action, "reject");

  // Same name but 40% different calories: a person decides if it is another recipe.
  const other = auto(cand({ kcal: 450 }), [{ ...shared, kcal: 300 }]);
  assert.equal(other.decisions.length, 0);
  assert.equal(other.needsHuman.length, 1);
});

test("auto: odd servings and calories with no macros wait for a person", () => {
  assert.equal(auto(cand({ grams: 900 })).needsHuman.length, 1);
  const none = auto(cand({ protein: 0, carbs: 0, fat: 0, fiber: 0 }));
  assert.equal(none.decisions.length, 0);
  assert.match(none.needsHuman[0].why, /no protein/i);
});

test("auto: every decision it makes passes the same checks as a hand-written one", () => {
  const foods = [cand(), cand({ id: "p2", kcal: 560 }), cand({ id: "p3", name: "asdf" })];
  const { decisions } = autoDecide(foods.map((c) => ({ food: c, review: reviewFood(c, []) })));
  const rows = new Map(foods.map((c) => [c.id, { ...c, status: "pending" as const, canonical_id: null }]));
  const { plans, errors } = planDecisions(decisions, rows);
  assert.deepEqual(errors, []);
  assert.equal(plans.length, 3);
});
