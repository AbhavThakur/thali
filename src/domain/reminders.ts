import type { SlotId } from "./types.ts";

export type MealReminder = "breakfast" | "lunch" | "snack" | "dinner";

export type ReminderPrefs = {
  enabled: boolean;
  meals: boolean;
  mealTimes: Record<MealReminder, string>;
  water: boolean;
  waterEveryHours: number;
  waterFrom: string;
  waterTo: string;
  evening: boolean;
  eveningTime: string;
  weighIn: boolean;
  /** 0 = Sunday … 6 = Saturday, like Date.getDay(). */
  weighInDay: number;
  weighInTime: string;
};

export const DEFAULT_REMINDERS: ReminderPrefs = {
  enabled: false,
  meals: true,
  mealTimes: {
    breakfast: "08:30",
    lunch: "13:30",
    snack: "17:00",
    dinner: "20:30",
  },
  water: true,
  waterEveryHours: 2,
  waterFrom: "09:00",
  waterTo: "20:00",
  evening: true,
  eveningTime: "21:30",
  weighIn: true,
  weighInDay: 0,
  weighInTime: "07:30",
};

export type TodayState = {
  loggedSlots: SlotId[];
  water: number;
  weighedToday: boolean;
};

export type PlannedReminder = {
  id: string;
  at: number;
  title: string;
  body: string;
  url: string;
};

/** iOS keeps at most 64 pending local notifications per app; leave headroom. */
export const MAX_PENDING = 60;

const MEAL_COPY: Record<MealReminder, [string, string]> = {
  breakfast: [
    "🥣 Breakfast time",
    "Your plan has breakfast ready. Tap to log it in one go.",
  ],
  lunch: ["🍛 Lunch time", "Had lunch? Log it to keep your day on track."],
  snack: [
    "🍎 Snack time",
    "A light snack keeps you going. Log it when you have it.",
  ],
  dinner: ["🍲 Dinner time", "Log your dinner and see how your day adds up."],
};

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const fmtTime = (hhmm: string) => {
  const t = mins(hhmm);
  const h = Math.floor(t / 60);
  return `${h % 12 || 12}:${String(t % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** Shifts "HH:MM" by `delta` minutes, wrapping within one day. */
export function shiftTime(hhmm: string, delta: number): string {
  const t = (((mins(hhmm) + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * One-off reminders for the next `days` days, soonest first. Today's reminders are skipped
 * when already done (meal logged, water goal met, weighed in), so re-planning after every
 * change keeps them relevant.
 */
export function planReminders(
  prefs: ReminderPrefs,
  now: Date,
  today: TodayState,
  waterGoal: number,
  days = 4,
): PlannedReminder[] {
  if (!prefs.enabled) return [];
  const out: PlannedReminder[] = [];
  for (let d = 0; d < days; d++) {
    const isToday = d === 0;
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const key = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
    const at = (hhmm: string) =>
      new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        0,
        mins(hhmm),
      ).getTime();
    const add = (id: string, when: number, title: string, body: string) => {
      if (when > now.getTime())
        out.push({ id: `${id}-${key}`, at: when, title, body, url: "/" });
    };

    if (prefs.meals)
      for (const meal of Object.keys(prefs.mealTimes) as MealReminder[]) {
        if (isToday && today.loggedSlots.includes(meal)) continue;
        add(`meal-${meal}`, at(prefs.mealTimes[meal]), ...MEAL_COPY[meal]);
      }

    if (prefs.water && !(isToday && today.water >= waterGoal)) {
      const step = Math.max(60, Math.round(prefs.waterEveryHours * 60));
      for (let t = mins(prefs.waterFrom); t <= mins(prefs.waterTo); t += step)
        add(
          `water-${t}`,
          at(shiftTime("00:00", t)),
          "💧 Water break",
          "Time for a glass of water. Tap a glass in Thali when you're done.",
        );
    }

    const mainMealsDone = ["breakfast", "lunch", "dinner"].every((s) =>
      today.loggedSlots.includes(s as SlotId),
    );
    if (prefs.evening && !(isToday && mainMealsDone))
      add(
        "evening",
        at(prefs.eveningTime),
        "🔥 Keep your streak going",
        "Log today's meals before bed. It takes a minute.",
      );

    if (
      prefs.weighIn &&
      day.getDay() === prefs.weighInDay &&
      !(isToday && today.weighedToday)
    )
      add(
        "weigh",
        at(prefs.weighInTime),
        "⚖️ Weekly weigh-in",
        "Step on the scale before breakfast and log it in Progress.",
      );
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_PENDING);
}
