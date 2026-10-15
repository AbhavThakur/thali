import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import {
  getAllLogs,
  getProfile,
  getSetting,
  getWaterHistory,
  getWeights,
  today,
  type WeightRow,
} from "../db/db.ts";
import { calorieTarget, macroTargets } from "../domain/energy.ts";
import { FOOD_BY_ID } from "../domain/foods.ts";
import { macrosFor } from "../domain/nutrition.ts";
import {
  ACHIEVEMENTS,
  dayStars,
  type Achievement,
  type DayStars,
  type Stats,
} from "../domain/rewards.ts";
import { bestStreak, loggingStreak } from "../domain/streak.ts";
import type { Profile } from "../domain/types.ts";

export const WATER_GOAL = 8;

export type DaySummary = {
  date: string;
  kcal: number;
  protein: number;
  stars: DayStars;
};

export type Progress = {
  profile: Profile;
  days: Map<string, DaySummary>;
  weights: WeightRow[];
  stats: Stats;
  streak: number;
  earned: Achievement[];
};

/** All-time history for the Progress tab and achievement checks; reloads on focus. */
export function useProgress() {
  const db = useSQLiteContext();
  const [data, setData] = useState<Progress | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const profile = await getProfile(db);
    if (!profile) {
      setData(null);
      setLoaded(true);
      return;
    }
    const [logs, weights, water, start] = await Promise.all([
      getAllLogs(db),
      getWeights(db),
      getWaterHistory(db),
      getSetting(db, "start_kg"),
    ]);
    const targets = macroTargets(profile, calorieTarget(profile).kcal);

    const raw = new Map<
      string,
      { kcal: number; protein: number; slots: Set<string> }
    >();
    for (const l of logs) {
      const food = FOOD_BY_ID[l.food_id];
      if (!food) continue;
      const m = macrosFor(food, l.qty);
      const d = raw.get(l.date) ?? {
        kcal: 0,
        protein: 0,
        slots: new Set<string>(),
      };
      d.kcal += m.kcal;
      d.protein += m.protein;
      d.slots.add(l.slot);
      raw.set(l.date, d);
    }
    const days = new Map<string, DaySummary>();
    for (const [date, d] of raw)
      days.set(date, {
        date,
        kcal: d.kcal,
        protein: d.protein,
        stars: dayStars(
          { ...targets, kcal: d.kcal, protein: d.protein },
          targets,
          [...d.slots],
        ),
      });

    const dates = [...days.keys()];
    const all = [...days.values()];
    const stats: Stats = {
      loggedDays: days.size,
      bestStreak: bestStreak(dates),
      onTargetDays: all.filter((d) => d.stars.onTarget).length,
      proteinDays: all.filter((d) => d.stars.protein).length,
      waterDays: water.filter((w) => w.glasses >= WATER_GOAL).length,
      startKg: start ? +start : (weights[0]?.kg ?? profile.weightKg),
      currentKg: weights.at(-1)?.kg ?? profile.weightKg,
      targetKg: profile.targetWeightKg,
      goal: profile.goal,
    };
    setData({
      profile,
      days,
      weights,
      stats,
      streak: loggingStreak(dates, today()),
      earned: ACHIEVEMENTS.filter((a) => a.earned(stats)),
    });
    setLoaded(true);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { data, loaded, reload };
}
