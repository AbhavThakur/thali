import { FOOD_BY_ID } from "./foods.ts";
import { macrosFor, sumMacros } from "./nutrition.ts";
import { SLOTS } from "./plan.ts";
import { dayStars, type DayStars } from "./rewards.ts";
import type { Macros, SlotId } from "./types.ts";

export type HistoryLog = {
  id: number;
  date: string;
  slot: SlotId;
  food_id: string;
  qty: number;
};
export type HistoryItem = {
  logId: number;
  foodId: string;
  name: string;
  qty: number;
  kcal: number;
};
export type HistoryMeal = {
  slot: SlotId;
  label: string;
  kcal: number;
  items: HistoryItem[];
};
export type HistoryDay = {
  date: string;
  /** false when nothing was logged, even if water or weight were. */
  logged: boolean;
  totals: Macros;
  meals: HistoryMeal[];
  stars: DayStars | null;
  water: number;
  weightKg: number | null;
};

const DAY_MS = 86_400_000;

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Every day from `to` back to `from` (inclusive), newest first, including days with nothing logged. */
export function buildHistory(
  input: {
    logs: HistoryLog[];
    water: { date: string; glasses: number }[];
    weights: { date: string; kg: number }[];
    target: Macros;
  },
  from: string,
  to: string,
): HistoryDay[] {
  const logsByDate = new Map<string, HistoryLog[]>();
  for (const l of input.logs) {
    if (!FOOD_BY_ID[l.food_id]) continue;
    const list = logsByDate.get(l.date) ?? [];
    list.push(l);
    logsByDate.set(l.date, list);
  }
  const water = new Map(input.water.map((w) => [w.date, w.glasses]));
  const weight = new Map(input.weights.map((w) => [w.date, w.kg]));

  const days: HistoryDay[] = [];
  for (let d = to; d >= from; d = shiftDate(d, -1)) {
    const rows = logsByDate.get(d) ?? [];
    const meals: HistoryMeal[] = SLOTS.flatMap((s) => {
      const items = rows
        .filter((r) => r.slot === s.id)
        .map((r) => {
          const food = FOOD_BY_ID[r.food_id];
          return {
            logId: r.id,
            foodId: r.food_id,
            name: food.name,
            qty: r.qty,
            kcal: macrosFor(food, r.qty).kcal,
          };
        });
      return items.length
        ? [
            {
              slot: s.id,
              label: s.label,
              kcal: items.reduce((a, i) => a + i.kcal, 0),
              items,
            },
          ]
        : [];
    });
    const totals = sumMacros(
      rows.map((r) => macrosFor(FOOD_BY_ID[r.food_id], r.qty)),
    );
    days.push({
      date: d,
      logged: rows.length > 0,
      totals,
      meals,
      stars: rows.length
        ? dayStars(
            totals,
            input.target,
            meals.map((m) => m.slot),
          )
        : null,
      water: water.get(d) ?? 0,
      weightKg: weight.get(d) ?? null,
    });
  }
  return days;
}

export type PeriodStats = {
  days: number;
  loggedDays: number;
  avgKcal: number;
  avgProtein: number;
  onTargetDays: number;
  stars: number;
  /** Last minus first weigh-in in the period; null with fewer than two. */
  weightChangeKg: number | null;
};

export function periodStats(days: HistoryDay[]): PeriodStats {
  const logged = days.filter((d) => d.logged);
  const avg = (pick: (d: HistoryDay) => number) =>
    logged.length
      ? Math.round(logged.reduce((s, d) => s + pick(d), 0) / logged.length)
      : 0;
  // `days` is newest first, so the oldest weigh-in is last.
  const weights = days
    .filter((d) => d.weightKg != null)
    .map((d) => d.weightKg as number);
  return {
    days: days.length,
    loggedDays: logged.length,
    avgKcal: avg((d) => d.totals.kcal),
    avgProtein: avg((d) => d.totals.protein),
    onTargetDays: logged.filter((d) => d.stars?.onTarget).length,
    stars: logged.reduce((s, d) => s + (d.stars?.stars ?? 0), 0),
    weightChangeKg:
      weights.length >= 2
        ? Math.round((weights[0] - weights[weights.length - 1]) * 10) / 10
        : null,
  };
}
