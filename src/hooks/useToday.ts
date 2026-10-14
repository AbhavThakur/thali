import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { calorieTarget, macroTargets } from "../domain/energy.ts";
import { FOOD_BY_ID } from "../domain/foods.ts";
import { macrosFor, sumMacros } from "../domain/nutrition.ts";
import type { Profile } from "../domain/types.ts";
import { getLogs, getProfile, today, type LogRow } from "../db/db.ts";

/** Profile, targets and today's logs; reloads whenever the screen gains focus. */
export function useToday() {
  const db = useSQLiteContext();
  const date = today();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setProfile(await getProfile(db));
    setLogs(await getLogs(db, date));
    setLoaded(true);
  }, [db, date]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const targets = useMemo(
    () => (profile ? macroTargets(profile, calorieTarget(profile).kcal) : null),
    [profile],
  );
  const consumed = useMemo(
    () =>
      sumMacros(
        logs
          .filter((l) => FOOD_BY_ID[l.food_id])
          .map((l) => macrosFor(FOOD_BY_ID[l.food_id], l.qty)),
      ),
    [logs],
  );

  return { db, date, profile, logs, targets, consumed, loaded, reload };
}
