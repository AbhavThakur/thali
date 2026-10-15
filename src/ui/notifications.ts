import * as Notifications from "./notify.ts";
import type { SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import {
  getLogs,
  getSetting,
  getWater,
  getWeights,
  setSetting,
  today,
} from "../db/db.ts";
import {
  DEFAULT_REMINDERS,
  planReminders,
  type ReminderPrefs,
} from "../domain/reminders.ts";
import type { SlotId } from "../domain/types.ts";
import { WATER_GOAL } from "../hooks/useProgress.ts";

const CHANNEL = "reminders";
const KEY = "reminders";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function loadReminderPrefs(
  db: SQLiteDatabase,
): Promise<ReminderPrefs> {
  const raw = await getSetting(db, KEY);
  if (!raw) return DEFAULT_REMINDERS;
  try {
    const saved = JSON.parse(raw) as Partial<ReminderPrefs>;
    return {
      ...DEFAULT_REMINDERS,
      ...saved,
      mealTimes: { ...DEFAULT_REMINDERS.mealTimes, ...saved.mealTimes },
    };
  } catch {
    return DEFAULT_REMINDERS;
  }
}

export function saveReminderPrefs(db: SQLiteDatabase, prefs: ReminderPrefs) {
  return setSetting(db, KEY, JSON.stringify(prefs));
}

// Some Expo Go builds on Android reject channel creation natively; then we fall back to the default channel.
let channelReady = false;

async function ensureChannel() {
  if (Platform.OS !== "android" || channelReady) return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Reminders",
      description: "Meal, water and weigh-in reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
    });
    channelReady = true;
  } catch (e) {
    console.warn("Could not create the reminders channel", e);
  }
}

/** Creates the Android channel and asks for permission if needed. Returns whether we may notify. */
export async function ensurePermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

let queue: Promise<void> = Promise.resolve();

/**
 * Re-plans every reminder from today's data. Safe to call often (after logs, water, weigh-ins):
 * calls are serialized and failures are swallowed so reminders never break the app.
 */
export function syncReminders(db: SQLiteDatabase): Promise<void> {
  queue = queue.then(async () => {
    try {
      const prefs = await loadReminderPrefs(db);
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (
        !prefs.enabled ||
        !(await Notifications.getPermissionsAsync()).granted
      )
        return;
      const date = today();
      const [logs, water, weights] = await Promise.all([
        getLogs(db, date),
        getWater(db, date),
        getWeights(db),
      ]);
      const planned = planReminders(
        prefs,
        new Date(),
        {
          loggedSlots: [...new Set(logs.map((l) => l.slot as SlotId))],
          water,
          weighedToday: weights.at(-1)?.date === date,
        },
        WATER_GOAL,
      );
      for (const r of planned)
        await Notifications.scheduleNotificationAsync({
          identifier: r.id,
          content: { title: r.title, body: r.body, data: { url: r.url } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: r.at,
            ...(channelReady && { channelId: CHANNEL }),
          },
        });
    } catch (e) {
      console.warn("Could not schedule reminders", e);
    }
  });
  return queue;
}

export async function sendTestReminder() {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🔔 Reminders are on",
      body: "This is how Thali will nudge you.",
      data: { url: "/" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      ...(channelReady && { channelId: CHANNEL }),
    },
  });
}
