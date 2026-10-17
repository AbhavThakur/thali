import type { Health } from "./types.ts";

export type Fast = { start: number; end: number; goalHours: number };
export type FastState = {
  active: { start: number; goalHours: number } | null;
  history: Fast[];
};

export const FAST_GOALS = [12, 14, 16, 18, 20, 24];
export const MAX_FAST_HOURS = 24;
const HOUR_MS = 3_600_000;
const KEEP = 60;
/** A fast ended almost at once was a mis-tap, so it isn't kept. */
const MIN_KEPT_MS = 5 * 60_000;

export const emptyFasting = (): FastState => ({ active: null, history: [] });

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Reads the saved state; anything damaged becomes an empty one. */
export function parseFasting(raw: string | null): FastState {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<FastState> | null;
    const a = v?.active;
    return {
      active:
        a && isNum(a.start) && isNum(a.goalHours)
          ? { start: a.start, goalHours: a.goalHours }
          : null,
      history: (Array.isArray(v?.history) ? v.history : [])
        .filter(
          (f) =>
            f &&
            isNum(f.start) &&
            isNum(f.end) &&
            isNum(f.goalHours) &&
            f.end > f.start,
        )
        .slice(-KEEP),
    };
  } catch {
    return emptyFasting();
  }
}

export function startFast(
  s: FastState,
  now: number,
  goalHours: number,
): FastState {
  if (s.active) return s;
  const goal = Math.min(Math.max(Math.round(goalHours), 1), MAX_FAST_HOURS);
  return { ...s, active: { start: now, goalHours: goal } };
}

export function endFast(s: FastState, now: number): FastState {
  if (!s.active) return s;
  const kept = now - s.active.start >= MIN_KEPT_MS;
  return {
    active: null,
    history: kept
      ? [
          ...s.history,
          { start: s.active.start, end: now, goalHours: s.active.goalHours },
        ].slice(-KEEP)
      : s.history,
  };
}

export const fastHours = (f: Fast) => (f.end - f.start) / HOUR_MS;
export const reachedGoal = (f: Fast) =>
  f.end - f.start >= f.goalHours * HOUR_MS;

/** "14h 05m", or "35m" under an hour. */
export function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function fastProgress(
  active: NonNullable<FastState["active"]>,
  now: number,
) {
  const elapsed = Math.max(0, now - active.start);
  const goalMs = active.goalHours * HOUR_MS;
  return {
    elapsed,
    remaining: Math.max(0, goalMs - elapsed),
    ratio: Math.min(elapsed / goalMs, 1),
    done: elapsed >= goalMs,
    /** Past a day: ask the person to eat. */
    tooLong: elapsed > MAX_FAST_HOURS * HOUR_MS,
  };
}

/** The last week of fasts, for the summary line. */
export function fastStats(history: Fast[], now: number) {
  const week = history.filter((f) => f.end >= now - 7 * 24 * HOUR_MS);
  return {
    count: week.length,
    reached: week.filter(reachedGoal).length,
    avgHours: week.length
      ? week.reduce((s, f) => s + fastHours(f), 0) / week.length
      : 0,
    longestHours: history.reduce((m, f) => Math.max(m, fastHours(f)), 0),
  };
}

export type FastingAccess =
  | { ok: true; caution: string | null }
  | { ok: false; reason: string };

/** Fasting is not offered where it could do harm, using the answers from the onboarding health check. */
export function fastingAccess(
  health: Health | null,
  age: number,
): FastingAccess {
  if (age < 18)
    return { ok: false, reason: "Fasting isn't for people under 18." };
  if (health?.pregnant)
    return {
      ok: false,
      reason: "Fasting isn't safe in pregnancy or while breastfeeding.",
    };
  if (health?.ed)
    return {
      ok: false,
      reason:
        "Because of your history with food, skipping meals isn't a good idea. Regular meals are the plan for you.",
    };
  return {
    ok: true,
    caution: health?.medical
      ? "You mentioned a health condition. Please check with your doctor before fasting."
      : null,
  };
}
