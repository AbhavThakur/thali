/**
 * Admin tool for the shared food list. Runs on your computer only; the service-role key never goes in the app.
 *
 *   npm run foods:auto               reviews everything with an obvious answer (dry run); add -- --yes to apply it
 *                                    and write foods-review/needs-human.json for the rest
 *   npm run foods:pending            writes foods-review/pending.json (new foods, with automatic checks, and reports)
 *   npm run foods:apply              checks foods-review/decisions.json and shows what it would do
 *   npm run foods:apply -- --yes     does it
 *
 * Setup: put SUPABASE_SERVICE_ROLE_KEY=... in .env.admin (git-ignored). The project URL comes from .env.
 * Review loop: run `foods:pending`, ask the assistant to review foods-review/pending.json and write
 * foods-review/decisions.json, read it, then run `foods:apply -- --yes`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import {
  autoDecide,
  planDecisions,
  reviewFood,
  type Candidate,
  type Plan,
  type Reference,
  type Row,
} from "../src/domain/foodReview.ts";
import { FOODS } from "../src/domain/foods.ts";

const DIR = "foods-review";
const COLUMNS =
  "id,name,unit,grams,kcal,protein,carbs,fat,fiber,tags,status,canonical_id,admin_note,created_at";

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [".env", ".env.admin"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

const env = { ...loadEnv(), ...process.env } as Record<
  string,
  string | undefined
>;
const base = (env.SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL ?? "").replace(
  /\/+$/,
  "",
);
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function need() {
  if (!base)
    throw new Error("No project URL. Put EXPO_PUBLIC_SUPABASE_URL in .env.");
  if (!key)
    throw new Error(
      "No admin key. Put SUPABASE_SERVICE_ROLE_KEY=... in .env.admin (it is git-ignored).",
    );
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(
      `${res.status} ${path.split("?")[0]}: ${text.slice(0, 300)}`,
    );
  return (text ? JSON.parse(text) : []) as T;
}

const toRow = (r: Record<string, unknown>): Row =>
  ({
    ...r,
    grams: Number(r.grams),
    kcal: Number(r.kcal),
    protein: Number(r.protein),
    carbs: Number(r.carbs),
    fat: Number(r.fat),
    fiber: Number(r.fiber),
    tags: (r.tags ?? {}) as Record<string, boolean>,
  }) as unknown as Row;

async function collect() {
  const [newRows, approvedRows, reports] = await Promise.all([
    rest<Record<string, unknown>[]>(
      `community_foods?status=eq.pending&select=${COLUMNS}&order=created_at.asc&limit=500`,
    ),
    rest<Record<string, unknown>[]>(
      `community_foods?status=eq.approved&canonical_id=is.null&select=${COLUMNS}&limit=5000`,
    ),
    rest<
      { id: number; food_id: string; message: string; created_at: string }[]
    >(
      `food_reports?resolved=eq.false&select=id,food_id,message,created_at&order=created_at.asc&limit=500`,
    ),
  ]);
  const approved = approvedRows.map(toRow);
  const refs: Reference[] = [
    ...FOODS.map((f) => ({
      id: f.id,
      name: f.name,
      kcal: f.per100g.kcal,
      source: "built-in" as const,
    })),
    ...approved.map((f) => ({
      id: f.id,
      name: f.name,
      kcal: f.kcal,
      source: "shared" as const,
    })),
  ];
  const view = (r: Candidate): Candidate => ({
    id: r.id,
    name: r.name,
    unit: r.unit,
    grams: r.grams,
    kcal: r.kcal,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    fiber: r.fiber,
    tags: r.tags,
  });
  const byId = new Map(approved.map((r) => [r.id, r]));
  const pendingItems = newRows.map(toRow).map((r) => ({
    ...view(r),
    submittedAt: (r as unknown as { created_at: string }).created_at,
    review: reviewFood(view(r), refs),
  }));
  const reportItems = reports.map((p) => ({
    reportId: p.id,
    reportedAt: p.created_at,
    message: p.message,
    food: byId.has(p.food_id)
      ? view(byId.get(p.food_id)!)
      : { id: p.food_id, missing: true },
  }));
  return { pendingItems, reportItems, approved, sharedCount: approved.length, view };
}

async function pending() {
  need();
  mkdirSync(DIR, { recursive: true });
  const { pendingItems, reportItems, sharedCount } = await collect();
  const out = {
    note:
      "Values are per 100 g, except the serving (unit + grams). Write decisions.json as a list of " +
      "{id, action: approve|reject|merge|update|dismiss, values?, note?, into?}. See src/domain/foodReview.ts.",
    pending: pendingItems,
    reports: reportItems,
    sharedCount,
  };
  writeFileSync(`${DIR}/pending.json`, JSON.stringify(out, null, 2));
  console.log(
    `${out.pending.length} new food(s) and ${out.reports.length} report(s) written to ${DIR}/pending.json ` +
      `(${out.pending.filter((p) => p.review.verdict !== "ok").length} flagged by the automatic checks).`,
  );
}

async function apply(write: boolean) {
  need();
  const file = `${DIR}/decisions.json`;
  if (!existsSync(file))
    throw new Error(
      `${file} not found. Run foods:pending first and write your decisions.`,
    );
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const ids = Array.isArray(raw)
    ? [
        ...new Set(
          raw
            .flatMap((d: { id?: string; into?: string }) => [d?.id, d?.into])
            .filter((x): x is string => typeof x === "string"),
        ),
      ]
    : [];
  const rows = new Map<string, Row>();
  if (ids.length) {
    const found = await rest<Record<string, unknown>[]>(
      `community_foods?id=in.(${ids.map((i) => encodeURIComponent(i)).join(",")})&select=${COLUMNS}`,
    );
    for (const r of found.map(toRow)) rows.set(r.id, r);
  }
  const { plans, errors } = planDecisions(raw, rows);
  if (errors.length) {
    console.error(
      "Nothing was changed. Fix these first:\n" +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
    process.exitCode = 1;
    return;
  }
  for (const p of plans) console.log(`  ${p.summary}`);
  if (!write) {
    console.log(
      `\nDry run: ${plans.length} change(s). Run again with --yes to apply.`,
    );
    return;
  }
  const done = await execute(plans);
  renameSync(
    file,
    `${DIR}/applied-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  console.log(
    `\nApplied ${done} of ${plans.length}. Phones pick the changes up within about half a day.`,
  );
}

/** Writes the planned changes; each only lands if the food is still in the state the plan expects. */
async function execute(plans: Plan[]) {
  let done = 0;
  for (const p of plans) {
    if (Object.keys(p.patch).length) {
      const changed = await rest<unknown[]>(
        `community_foods?id=eq.${encodeURIComponent(p.row.id)}&status=eq.${p.requires}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(p.patch),
        },
      );
      if (!changed.length) {
        console.error(
          `  skipped “${p.row.name}”: it changed since the review file was made.`,
        );
        continue;
      }
    }
    if (p.resolveReports)
      await rest(
        `food_reports?food_id=eq.${encodeURIComponent(p.row.id)}&resolved=eq.false`,
        {
          method: "PATCH",
          body: JSON.stringify({ resolved: true }),
        },
      );
    done++;
  }
  return done;
}

/** Reviews everything that has an obvious answer; what needs a person goes to needs-human.json. */
async function auto(write: boolean) {
  need();
  mkdirSync(DIR, { recursive: true });
  const { pendingItems, reportItems, approved, view } = await collect();
  const items = pendingItems.map((p) => ({ food: view(p), review: p.review }));
  const { decisions, needsHuman } = autoDecide(items);
  const rows = new Map<string, Row>(
    [...pendingItems.map((p) => ({ ...view(p), status: "pending" as const, canonical_id: null })), ...approved].map((r) => [r.id, r]),
  );
  // Each decision is checked on its own, so one the checks refuse goes to a person instead of blocking the rest.
  const ok: Plan[] = [];
  for (const d of decisions) {
    const r = planDecisions([d], rows);
    if (r.errors.length)
      needsHuman.push({ ...items.find((i) => i.food.id === d.id)!, why: `The automatic fix was refused: ${r.errors[0]}` });
    else ok.push(...r.plans);
  }
  for (const p of ok) console.log(`  ${p.summary}`);
  const humanFile = `${DIR}/needs-human.json`;
  writeFileSync(humanFile, JSON.stringify({ needsHuman, reports: reportItems }, null, 2));
  const done = write ? await execute(ok) : 0;
  console.log(
    `\n${write ? `Applied ${done} of ${ok.length}` : `Dry run: ${ok.length} automatic change(s)`}; ` +
      `${needsHuman.length} food(s) and ${reportItems.length} report(s) need a person (see ${humanFile}).` +
      (write || !ok.length ? "" : " Run again with --yes to apply."),
  );
}

const [cmd, ...flags] = process.argv.slice(2);
try {
  if (cmd === "pending") await pending();
  else if (cmd === "apply") await apply(flags.includes("--yes"));
  else if (cmd === "auto") await auto(flags.includes("--yes"));
  else console.log("Usage: foods-review.ts auto [--yes] | pending | apply [--yes]");
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
