import { macroKcal } from "./customFood.ts";

/** A shared-food row as the admin sees it: everything per 100 g except the serving. */
export type Candidate = {
  id: string;
  name: string;
  unit: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  tags: Record<string, boolean>;
};

export type Values = Pick<
  Candidate,
  | "name"
  | "unit"
  | "grams"
  | "kcal"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber"
  | "tags"
>;

/** A food that already exists (built in or approved), used to spot duplicates. */
export type Reference = {
  id: string;
  name: string;
  kcal: number;
  source: "built-in" | "shared";
};

export type Finding = {
  code:
    | "no-macros"
    | "kcal-mismatch"
    | "high-kcal"
    | "serving"
    | "junk"
    | "duplicate";
  level: "fix" | "warn";
  message: string;
};

export type Review = {
  /** What one serving gives, so a human can sanity-check against the pack or the dish. */
  perServing: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  findings: Finding[];
  /** Calories per 100 g that the macros add up to, when the typed calories are off. */
  suggestedKcal?: number;
  duplicates: (Reference & { kcalDiffPct: number })[];
  verdict: "ok" | "check" | "fix";
};

export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s: string) =>
  new Set(normalizeName(s).split(" ").filter(Boolean));

/** 0 to 1: how much two names share. */
export function nameSimilarity(a: string, b: string) {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

const per = (v: number, grams: number) =>
  Math.round(((v * grams) / 100) * 10) / 10;

/** The limits the database enforces, so a fix can never be refused halfway through applying. */
export function checkValues(v: Values): string | null {
  if (typeof v.name !== "string" || typeof v.unit !== "string")
    return "name and unit must be text";
  if (
    ![v.grams, v.kcal, v.protein, v.carbs, v.fat, v.fiber].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    )
  )
    return "grams, kcal, protein, carbs, fat and fiber must be numbers";
  if (!v.tags || typeof v.tags !== "object" || Array.isArray(v.tags))
    return "tags must be an object";
  const nm = v.name.trim();
  if (nm.length < 2 || nm.length > 60) return "name must be 2 to 60 characters";
  if (v.unit.trim().length < 1 || v.unit.trim().length > 30)
    return "unit must be 1 to 30 characters";
  if (!(v.grams >= 1 && v.grams <= 1000)) return "grams must be 1 to 1000";
  if (!(v.kcal >= 0 && v.kcal <= 900)) return "kcal per 100 g must be 0 to 900";
  for (const k of ["protein", "carbs", "fat", "fiber"] as const)
    if (!(v[k] >= 0 && v[k] <= 100)) return `${k} per 100 g must be 0 to 100`;
  if (v.protein + v.carbs + v.fat > 100.5)
    return "protein + carbs + fat is over 100 g per 100 g";
  if (v.fiber > v.carbs) return "fiber is more than carbs";
  return null;
}

export function reviewFood(c: Candidate, refs: Reference[]): Review {
  const findings: Finding[] = [];
  let suggestedKcal: number | undefined;

  const implied = macroKcal(c.protein, c.carbs, c.fat, c.fiber);
  const macros = c.protein + c.carbs + c.fat;
  if (macros === 0 && c.kcal > 20)
    findings.push({
      code: "no-macros",
      level: "warn",
      message: "Calories but no protein, carbs or fat entered.",
    });
  if (macros > 0) {
    const gap = Math.abs(implied - c.kcal) / Math.max(implied, c.kcal, 1);
    if (gap > 0.1) {
      suggestedKcal = Math.round(implied);
      findings.push({
        code: "kcal-mismatch",
        level: gap > 0.2 ? "fix" : "warn",
        message: `Calories (${c.kcal}) differ from what the macros add up to (${Math.round(implied)}) per 100 g.`,
      });
    }
  }
  if (c.kcal > 800 && c.fat < 80)
    findings.push({
      code: "high-kcal",
      level: "warn",
      message: "Very high calories for the fat content.",
    });
  if (c.grams < 5 || c.grams > 800)
    findings.push({
      code: "serving",
      level: "warn",
      message: `Unusual serving weight (${c.grams} g).`,
    });
  const nm = normalizeName(c.name);
  if (
    !/\p{L}/u.test(nm) ||
    /\b(test|asdf|xxx|qwerty|http|www)\b/.test(nm) ||
    /(.)\1{3,}/.test(nm)
  )
    findings.push({
      code: "junk",
      level: "fix",
      message: "The name looks like a test or junk entry.",
    });

  const duplicates = refs
    .filter(
      (r) =>
        normalizeName(r.name) === nm || nameSimilarity(r.name, c.name) >= 0.75,
    )
    .map((r) => ({
      ...r,
      kcalDiffPct: Math.round(
        (Math.abs(r.kcal - c.kcal) / Math.max(r.kcal, c.kcal, 1)) * 100,
      ),
    }))
    .slice(0, 5);
  if (duplicates.length)
    findings.push({
      code: "duplicate",
      level: "warn",
      message: `Looks like ${duplicates.map((d) => `“${d.name}” (${d.source}, ${d.kcalDiffPct}% apart)`).join(", ")}.`,
    });

  return {
    perServing: {
      kcal: Math.round((c.kcal * c.grams) / 100),
      protein: per(c.protein, c.grams),
      carbs: per(c.carbs, c.grams),
      fat: per(c.fat, c.grams),
      fiber: per(c.fiber, c.grams),
    },
    findings,
    suggestedKcal,
    duplicates,
    verdict: findings.some((f) => f.level === "fix")
      ? "fix"
      : findings.length
        ? "check"
        : "ok",
  };
}

// ---- Decisions --------------------------------------------------------------------------------

export type Decision =
  /** Publish a pending food, optionally with corrected values. */
  | { id: string; action: "approve"; values?: Partial<Values>; note?: string }
  /** Keep a pending food private. The person sees the note. */
  | { id: string; action: "reject"; note: string }
  /** A pending food that is the same as one already shared: its owner gets the shared one. */
  | { id: string; action: "merge"; into: string; note?: string }
  /** Fix an already-shared food. Everyone, including whoever added it, gets the correction. */
  | { id: string; action: "update"; values: Partial<Values>; note?: string }
  /** Close reports on a shared food without changing it. */
  | { id: string; action: "dismiss" };

export type Row = Candidate & {
  status: "pending" | "approved" | "rejected";
  canonical_id: string | null;
};

export type Plan = {
  decision: Decision;
  row: Row;
  /** Only filters rows that are still in the state the decision expects, so a stale file can't overwrite. */
  requires: "pending" | "approved";
  patch: Record<string, unknown>;
  resolveReports: boolean;
  summary: string;
};

const VALUE_KEYS = [
  "name",
  "unit",
  "grams",
  "kcal",
  "protein",
  "carbs",
  "fat",
  "fiber",
  "tags",
] as const;

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Checks a decisions file against the rows it refers to and turns each decision into the exact database change.
 * Anything doubtful goes into `errors`, and callers should write nothing when there are errors.
 */
export function planDecisions(
  raw: unknown,
  rows: Map<string, Row>,
  now = new Date().toISOString(),
): { plans: Plan[]; errors: string[] } {
  const plans: Plan[] = [];
  const errors: string[] = [];
  if (!Array.isArray(raw))
    return { plans, errors: ["decisions.json must be a list."] };
  const seen = new Set<string>();

  for (const [i, d] of (raw as Decision[]).entries()) {
    const at = `#${i + 1} (${d?.id ?? "?"})`;
    const row = d && typeof d.id === "string" ? rows.get(d.id) : undefined;
    if (!row) {
      errors.push(`${at}: no such food.`);
      continue;
    }
    if (seen.has(row.id)) {
      errors.push(`${at}: appears twice.`);
      continue;
    }
    seen.add(row.id);
    const note =
      "note" in d && typeof d.note === "string"
        ? d.note.trim().slice(0, 300)
        : "";
    const stamp = { reviewed_at: now, updated_at: now };

    const merged = (
      values: Partial<Values> | undefined,
    ): { error: string } | { v: Values; changed: boolean } => {
      const base = Object.fromEntries(
        VALUE_KEYS.map((k) => [k, row[k]]),
      ) as Values;
      const v: Values = { ...base };
      for (const k of Object.keys(values ?? {})) {
        if (!(VALUE_KEYS as readonly string[]).includes(k))
          return { error: `unknown field "${k}"` };
        (v as Record<string, unknown>)[k] = (values as Record<string, unknown>)[
          k
        ];
      }
      const problem = checkValues(v);
      if (problem) return { error: problem };
      return { v, changed: VALUE_KEYS.some((k) => !same(v[k], base[k])) };
    };

    if (d.action === "approve" || d.action === "update") {
      const need = d.action === "approve" ? "pending" : "approved";
      if (row.status !== need) {
        errors.push(
          `${at}: ${d.action} needs a ${need} food, but this one is ${row.status}.`,
        );
        continue;
      }
      if (d.action === "update" && !Object.keys(d.values ?? {}).length) {
        errors.push(`${at}: update has no values.`);
        continue;
      }
      const m = merged(d.values);
      if ("error" in m) {
        errors.push(`${at}: ${m.error}.`);
        continue;
      }
      plans.push({
        decision: d,
        row,
        requires: need,
        resolveReports: d.action === "update",
        patch: {
          ...(d.action === "approve"
            ? { status: "approved", canonical_id: null }
            : {}),
          ...Object.fromEntries(VALUE_KEYS.map((k) => [k, m.v[k]])),
          admin_note: note,
          changed_by_admin: m.changed,
          ...stamp,
        },
        summary: `${d.action} “${m.v.name}”${m.changed ? " with corrections" : ""}`,
      });
    } else if (d.action === "reject") {
      if (row.status !== "pending") {
        errors.push(
          `${at}: reject needs a pending food, but this one is ${row.status}.`,
        );
        continue;
      }
      if (!note) {
        errors.push(`${at}: reject needs a note, the person will see it.`);
        continue;
      }
      plans.push({
        decision: d,
        row,
        requires: "pending",
        resolveReports: false,
        patch: { status: "rejected", admin_note: note, ...stamp },
        summary: `reject “${row.name}”: ${note}`,
      });
    } else if (d.action === "merge") {
      const target = rows.get(d.into);
      if (row.status !== "pending") {
        errors.push(
          `${at}: merge needs a pending food, but this one is ${row.status}.`,
        );
      } else if (
        !target ||
        target.status !== "approved" ||
        target.canonical_id ||
        target.id === row.id
      ) {
        errors.push(
          `${at}: "${d.into}" is not an approved food to merge into.`,
        );
      } else {
        plans.push({
          decision: d,
          row,
          requires: "pending",
          resolveReports: false,
          patch: {
            status: "approved",
            canonical_id: target.id,
            admin_note: note || "Matched a food that is already in the list.",
            ...stamp,
          },
          summary: `merge “${row.name}” into “${target.name}”`,
        });
      }
    } else if (d.action === "dismiss") {
      if (row.status !== "approved") {
        errors.push(`${at}: dismiss needs an approved food.`);
        continue;
      }
      plans.push({
        decision: d,
        row,
        requires: "approved",
        resolveReports: true,
        patch: {},
        summary: `dismiss reports on “${row.name}”`,
      });
    } else {
      errors.push(`${at}: unknown action.`);
    }
  }
  return { plans, errors };
}

// ---- Automatic review -------------------------------------------------------------------------

export type AutoItem = { food: Candidate; review: Review };

export type NeedsHuman = { food: Candidate; review: Review; why: string };

/** Duplicates this close in calories are treated as the same food. */
const SAME_FOOD_KCAL_PCT = 10;

/**
 * Decides every pending food that has an obvious answer, and sets the rest aside for a person:
 * clean foods are approved, calories that disagree with the macros are corrected, junk names are refused,
 * and near-identical copies of an existing food are merged. Anything else (odd servings, a different
 * recipe under a familiar name, calories with no macros) waits for a human.
 */
export function autoDecide(items: AutoItem[]): {
  decisions: Decision[];
  needsHuman: NeedsHuman[];
} {
  const decisions: Decision[] = [];
  const needsHuman: NeedsHuman[] = [];
  const later = (it: AutoItem, why: string) => needsHuman.push({ ...it, why });

  for (const it of items) {
    const { food, review } = it;
    const codes = new Set(review.findings.map((f) => f.code));

    if (codes.has("junk")) {
      decisions.push({
        id: food.id,
        action: "reject",
        note: "That doesn't look like a real food name.",
      });
      continue;
    }

    if (codes.has("duplicate")) {
      const same = review.duplicates.find(
        (d) => d.kcalDiffPct <= SAME_FOOD_KCAL_PCT,
      );
      const clean = [...codes].every((c) => c === "duplicate");
      if (same && clean && same.source === "shared")
        decisions.push({ id: food.id, action: "merge", into: same.id });
      else if (same && clean)
        decisions.push({
          id: food.id,
          action: "reject",
          note: "Thali already has this food built in.",
        });
      else
        later(it, "Similar to an existing food but not the same; is it a different recipe?");
      continue;
    }

    if (codes.has("no-macros") || codes.has("high-kcal") || codes.has("serving")) {
      later(it, review.findings.map((f) => f.message).join(" "));
      continue;
    }

    if (codes.has("kcal-mismatch") && review.suggestedKcal !== undefined) {
      decisions.push({
        id: food.id,
        action: "approve",
        values: { kcal: review.suggestedKcal },
        note: "Calories corrected to match the protein, carbs and fat.",
      });
      continue;
    }

    decisions.push({ id: food.id, action: "approve" });
  }
  return { decisions, needsHuman };
}
