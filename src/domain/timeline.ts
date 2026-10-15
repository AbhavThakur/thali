import { bmiCategory, bmiOf } from "./bmi.ts";
import {
  GAIN_BMI_LIMIT,
  KCAL_PER_KG,
  MAX_DEFICIT_RATIO,
  MAX_SURPLUS_RATIO,
  MIN_KCAL,
  calorieTarget,
  tdee,
} from "./energy.ts";
import type { Profile } from "./types.ts";

// Safe limits on how fast weight may change, whatever date someone asks for.
const MAX_LOSS_KG_WEEK = 1;
/** Losing more than 1% of body weight a week is too fast for a smaller person. */
const MAX_LOSS_SHARE_WEEK = 0.01;
const MAX_GAIN_KG_WEEK = 0.5;
/** Below this the daily change is too small to notice, so longer dates aren't offered. */
const MIN_RATE_KG_WEEK = 0.1;
const MAX_WEEKS = 104;
/** Most people stay with a plan better when it asks a bit less of them than the safe maximum. */
const RECOMMENDED_SHARE = 0.85;

/**
 * The pace we suggest before the safe-maximum limit: more to lose means more room to move faster,
 * while someone close to a healthy weight is better off slowly. BMI bands are the Asian cut-offs.
 */
export function recommendedRate(p: Profile): number {
  const category = bmiCategory(bmiOf(p.heightCm, p.weightKg));
  if (p.goal === "lose")
    return category === "obese" ? 0.75 : category === "overweight" ? 0.5 : 0.35;
  return p.goal === "gain" && category === "underweight" ? 0.4 : 0.25;
}
const DAY_MS = 86_400_000;

export type Timeline = {
  /** Kilos to move toward the target. */
  changeKg: number;
  /** Fastest safe pace, kg per week. */
  maxRateKg: number;
  minWeeks: number;
  recommendedWeeks: number;
  maxWeeks: number;
};

export type TimelinePlan = {
  weeks: number;
  /** YYYY-MM-DD */
  date: string;
  /** kg per week that gets there by `date`. */
  rateKg: number;
  kcal: number;
  /** The profile with the pace and date filled in. */
  profile: Profile;
};

export type TimelinePreset = TimelinePlan & {
  id: "fast" | "steady" | "relaxed";
  label: string;
};

const floor2 = (n: number) => Math.floor(n * 100 + 1e-9) / 100;
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

export function addWeeks(date: string, weeks: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + weeks * 7 * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Whole weeks from `from` to `date`, rounded up; 0 if the date has passed. */
export function weeksUntil(date: string, from: string): number {
  const days =
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    DAY_MS;
  return Math.max(0, Math.ceil(days / 7));
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-12-07" becomes "7 Dec 2026". */
export function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * The fastest weekly change that still respects every safety rule: at most 1 kg (or 1% of body weight)
 * for loss, at most 0.5 kg for gain, no deficit above 25% of maintenance, no eating below the calorie
 * floor, and no surplus above the cap for the goal. 0 when the goal isn't to change weight.
 */
export function maxWeeklyRate(p: Profile): number {
  const maintenance = tdee(p);
  if (p.goal === "lose") {
    const room = Math.min(
      maintenance * MAX_DEFICIT_RATIO,
      Math.max(0, maintenance - MIN_KCAL[p.sex]),
    );
    return floor2(
      Math.min(
        MAX_LOSS_KG_WEEK,
        p.weightKg * MAX_LOSS_SHARE_WEEK,
        (room * 7) / KCAL_PER_KG,
      ),
    );
  }
  if (p.goal === "gain" || p.goal === "muscle") {
    const room = maintenance * MAX_SURPLUS_RATIO[p.goal];
    return floor2(Math.min(MAX_GAIN_KG_WEEK, (room * 7) / KCAL_PER_KG));
  }
  return 0;
}

/**
 * The range of dates that make sense for this person, or null when there is nothing to schedule
 * (staying healthy, already at the target, or a high BMI where adding weight isn't advised).
 */
export function timelineFor(p: Profile): Timeline | null {
  if (p.goal === "maintain") return null;
  const gaining = p.goal === "gain" || p.goal === "muscle";
  if (gaining && p.weightKg / (p.heightCm / 100) ** 2 >= GAIN_BMI_LIMIT)
    return null;
  const changeKg = gaining
    ? p.targetWeightKg - p.weightKg
    : p.weightKg - p.targetWeightKg;
  if (!(changeKg > 0.05)) return null;
  const maxRateKg = maxWeeklyRate(p);
  if (maxRateKg <= 0) return null;
  const minWeeks = Math.max(2, Math.ceil(changeKg / maxRateKg));
  const maxWeeks = Math.max(
    minWeeks,
    Math.min(MAX_WEEKS, Math.ceil(changeKg / MIN_RATE_KG_WEEK)),
  );
  const recommended = Math.min(
    recommendedRate(p),
    maxRateKg * RECOMMENDED_SHARE,
  );
  return {
    changeKg,
    maxRateKg,
    minWeeks,
    maxWeeks,
    recommendedWeeks: clamp(
      Math.ceil(changeKg / recommended),
      minWeeks,
      maxWeeks,
    ),
  };
}

export const clampWeeks = (t: Timeline, weeks: number) =>
  clamp(Math.round(weeks), t.minWeeks, t.maxWeeks);

/** Weekly pace that reaches the target in `weeks`, never above the safe maximum. */
export function rateForWeeks(t: Timeline, weeks: number): number {
  const rate = Math.round((t.changeKg / clampWeeks(t, weeks)) * 100) / 100;
  return Math.min(
    t.maxRateKg,
    Math.max(Math.min(MIN_RATE_KG_WEEK, t.maxRateKg), rate),
  );
}

/** How many weeks a saved pace takes, kept inside the allowed range. */
export function weeksForRate(t: Timeline, rateKg: number): number {
  return clampWeeks(
    t,
    rateKg > 0 ? Math.ceil(t.changeKg / rateKg - 1e-9) : t.maxWeeks,
  );
}

/** Works out the pace, calories and date for finishing in `weeks` starting `from`. Null if nothing to schedule. */
export function planForWeeks(
  p: Profile,
  weeks: number,
  from: string,
): TimelinePlan | null {
  const t = timelineFor(p);
  if (!t) return null;
  const w = clampWeeks(t, weeks);
  const rateKg = rateForWeeks(t, w);
  const date = addWeeks(from, w);
  const profile: Profile = {
    ...p,
    targetDate: date,
    ...(p.goal === "lose"
      ? { weeklyLossKg: rateKg }
      : { weeklyGainKg: rateKg }),
  };
  return { weeks: w, date, rateKg, kcal: calorieTarget(profile).kcal, profile };
}

/** Quick choices: fastest safe, recommended and relaxed, without duplicates, soonest first. */
export function timelinePresets(p: Profile, from: string): TimelinePreset[] {
  const t = timelineFor(p);
  if (!t) return [];
  const picks: [TimelinePreset["id"], string, number][] = [
    ["steady", "Steady (recommended)", t.recommendedWeeks],
    ["fast", "Fastest safe", t.minWeeks],
    ["relaxed", "Relaxed", Math.round(t.recommendedWeeks * 1.5)],
  ];
  const seen = new Set<number>();
  const out: TimelinePreset[] = [];
  for (const [id, label, wanted] of picks) {
    const plan = planForWeeks(p, wanted, from);
    if (!plan || seen.has(plan.weeks)) continue;
    seen.add(plan.weeks);
    out.push({ ...plan, id, label });
  }
  return out.sort((a, b) => a.weeks - b.weeks);
}
