import type { Goal, Macros } from "./types.ts";

export type DayStars = {
  stars: number;
  allMeals: boolean;
  onTarget: boolean;
  protein: boolean;
};

const MAIN_MEALS = ["breakfast", "lunch", "dinner"];

/**
 * Up to 3 stars a day: all main meals logged, calories within ±10% of target,
 * protein at least 90% of target. Eating less than the range never earns a star.
 */
export function dayStars(
  eaten: Macros,
  target: Macros,
  slotsLogged: string[],
): DayStars {
  const allMeals = MAIN_MEALS.every((s) => slotsLogged.includes(s));
  const onTarget =
    eaten.kcal >= target.kcal * 0.9 && eaten.kcal <= target.kcal * 1.1;
  const protein = eaten.protein >= target.protein * 0.9;
  return {
    stars: +allMeals + +onTarget + +protein,
    allMeals,
    onTarget,
    protein,
  };
}

export type Stats = {
  loggedDays: number;
  bestStreak: number;
  onTargetDays: number;
  proteinDays: number;
  waterDays: number;
  startKg: number;
  currentKg: number;
  targetKg: number;
  goal: Goal;
};

export type Achievement = {
  id: string;
  emoji: string;
  title: string;
  hint: string;
  earned: (s: Stats) => boolean;
};

/** Kilos moved toward the goal: down for weight loss, up for gain or muscle, 0 when staying steady. */
export const progressKg = (s: Stats): number =>
  s.goal === "lose"
    ? s.startKg - s.currentKg
    : s.goal === "maintain"
      ? 0
      : s.currentKg - s.startKg;

/** Kilos the whole goal needs; 0 when staying steady or already there. */
export const goalKg = (s: Stats): number =>
  s.goal === "lose"
    ? s.startKg - s.targetKg
    : s.goal === "maintain"
      ? 0
      : s.targetKg - s.startKg;

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_log",
    emoji: "🍽️",
    title: "First bite",
    hint: "Log your first meal",
    earned: (s) => s.loggedDays >= 1,
  },
  {
    id: "streak_3",
    emoji: "🔥",
    title: "On a roll",
    hint: "Log 3 days in a row",
    earned: (s) => s.bestStreak >= 3,
  },
  {
    id: "streak_7",
    emoji: "🏅",
    title: "One full week",
    hint: "Log 7 days in a row",
    earned: (s) => s.bestStreak >= 7,
  },
  {
    id: "streak_30",
    emoji: "🏆",
    title: "Habit made",
    hint: "Log 30 days in a row",
    earned: (s) => s.bestStreak >= 30,
  },
  {
    id: "on_target_7",
    emoji: "🎯",
    title: "Bullseye",
    hint: "Land on target 7 days",
    earned: (s) => s.onTargetDays >= 7,
  },
  {
    id: "protein_5",
    emoji: "💪",
    title: "Protein pro",
    hint: "Hit protein 5 days",
    earned: (s) => s.proteinDays >= 5,
  },
  {
    id: "water_5",
    emoji: "💧",
    title: "Hydration hero",
    hint: "Drink 8 glasses on 5 days",
    earned: (s) => s.waterDays >= 5,
  },
  {
    id: "first_kg",
    emoji: "🌱",
    title: "First kilo",
    hint: "Move 1 kg toward your goal",
    earned: (s) => progressKg(s) >= 1,
  },
  {
    id: "five_percent",
    emoji: "⭐",
    title: "5% there",
    hint: "Move 5% of your start weight toward your goal",
    earned: (s) => progressKg(s) >= s.startKg * 0.05,
  },
  {
    id: "halfway",
    emoji: "🧭",
    title: "Halfway there",
    hint: "Reach half of your goal",
    earned: (s) => goalKg(s) > 0 && progressKg(s) >= goalKg(s) / 2,
  },
  {
    id: "goal",
    emoji: "🎉",
    title: "Goal reached",
    hint: "Reach your target weight",
    earned: (s) =>
      s.goal === "lose"
        ? s.currentKg <= s.targetKg
        : s.goal !== "maintain" && s.currentKg >= s.targetKg,
  },
];

/** Trailing moving average; each point averages itself and up to `window - 1` earlier points. */
export function movingAverage(values: number[], window = 7): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}
