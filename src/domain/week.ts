import { weekStart } from "./family.ts";
import { shiftDate } from "./history.ts";

export type DayState = "none" | "under" | "on" | "over" | "future";

export type WeekDay = {
  date: string;
  /** Mon, Tue, … */
  label: string;
  kcal: number;
  state: DayState;
  isToday: boolean;
};

export type WeekSummary = {
  from: string;
  days: WeekDay[];
  /** Finished days with every main meal logged; today and half-logged days are left out. */
  countedDays: number;
  avgKcal: number;
  /** Average against target, in percent (+8 is 8% above). */
  diffPct: number;
  insight: { text: string; tone: "good" | "info" | "warn" };
};

const LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Same 10% window as the daily "on target" star. */
const WINDOW = 0.1;

/**
 * Monday to Sunday of the week that contains `to`, judged as a week rather than day by day:
 * one bigger day is fine when the average is close. Never praises eating well below target.
 */
export function weekSummary(
  history: {
    date: string;
    logged: boolean;
    totals: { kcal: number };
    /** false when meals are missing, so the day says little about how much was eaten. */
    complete?: boolean;
  }[],
  targetKcal: number,
  to: string,
): WeekSummary {
  const from = weekStart(to);
  const byDate = new Map(history.map((d) => [d.date, d]));
  const days: WeekDay[] = LABELS.map((label, i) => {
    const date = shiftDate(from, i);
    const kcal = Math.round(byDate.get(date)?.totals.kcal ?? 0);
    const logged = byDate.get(date)?.logged ?? false;
    const ratio = targetKcal ? kcal / targetKcal : 0;
    const state: DayState =
      date > to
        ? "future"
        : !logged
          ? "none"
          : ratio < 1 - WINDOW
            ? "under"
            : ratio <= 1 + WINDOW
              ? "on"
              : "over";
    return { date, label, kcal, state, isToday: date === to };
  });

  const counted = days.filter(
    (d) =>
      d.date < to &&
      (d.state === "under" || d.state === "on" || d.state === "over") &&
      byDate.get(d.date)?.complete !== false,
  );
  const avgKcal = counted.length
    ? Math.round(counted.reduce((s, d) => s + d.kcal, 0) / counted.length)
    : 0;
  const diffPct =
    targetKcal && counted.length
      ? Math.round(((avgKcal - targetKcal) / targetKcal) * 100)
      : 0;

  let insight: WeekSummary["insight"];
  if (!counted.length)
    insight = {
      text: "Log all your meals on a few days and your weekly average shows up here.",
      tone: "info",
    };
  else if (diffPct > WINDOW * 100)
    insight = {
      text: `You're averaging about ${avgKcal - targetKcal} kcal a day above target. Small swaps at snack time help, and there's no need to skip meals.`,
      tone: "warn",
    };
  else if (diffPct < -WINDOW * 100)
    insight = {
      text: "You're averaging well below your target. Eat your planned meals so you get enough energy and protein.",
      tone: "warn",
    };
  else if (counted.some((d) => d.state === "over"))
    insight = {
      text: "One bigger day is fine: your week is still balanced.",
      tone: "good",
    };
  else
    insight = {
      text: "Your week is steady and close to your target.",
      tone: "good",
    };

  return { from, days, countedDays: counted.length, avgKcal, diffPct, insight };
}
