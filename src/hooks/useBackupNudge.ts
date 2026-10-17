import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { getCustomFoods, getLoggedDates } from "../db/db.ts";
import { backupNudge, snoozeUntil, type Nudge } from "../domain/backupNudge.ts";
import { loadSession } from "../ui/cloudSync.ts";
import Storage from "../ui/kv";

const KEY = "backup_nudge";

type Saved = { dismissed: number; snoozedUntil: number | null };

function read(): Saved {
  try {
    const raw = Storage.getItemSync(KEY);
    if (raw) return { dismissed: 0, snoozedUntil: null, ...JSON.parse(raw) };
  } catch {
    // A damaged value just starts the nudges over.
  }
  return { dismissed: 0, snoozedUntil: null };
}

/** The "back up your data" card for Today: null when nothing is due; `later` snoozes it for a while. */
export function useBackupNudge(streak: number) {
  const db = useSQLiteContext();
  const [nudge, setNudge] = useState<Nudge | null>(null);

  const refresh = useCallback(async () => {
    const [foods, dates] = await Promise.all([
      getCustomFoods(db),
      getLoggedDates(db),
    ]);
    setNudge(
      backupNudge({
        signedIn: !!loadSession(),
        ownFoods: foods.length,
        loggedDays: dates.length,
        streak,
        snoozedUntil: read().snoozedUntil,
        now: Date.now(),
      }),
    );
  }, [db, streak]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const later = () => {
    const saved = read();
    Storage.setItemSync(
      KEY,
      JSON.stringify({
        dismissed: saved.dismissed + 1,
        snoozedUntil: snoozeUntil(Date.now(), saved.dismissed),
      } satisfies Saved),
    );
    setNudge(null);
  };

  return { nudge, later };
}
