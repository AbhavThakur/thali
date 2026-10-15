import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { calorieTarget, macroTargets } from "../domain/energy.ts";
import { FOOD_BY_ID } from "../domain/foods.ts";
import { macrosFor, sumMacros } from "../domain/nutrition.ts";
import { loggingStreak } from "../domain/streak.ts";
import type { PlanOverride, Profile } from "../domain/types.ts";
import {
  getLoggedDates,
  getLogs,
  getOverrides,
  getProfile,
  getWater,
  today,
  type LogRow,
} from "../db/db.ts";
import { syncReminders } from "../ui/notifications.ts";
import { publishFamily } from "../ui/familySync.ts";
import { usePeople } from "../ui/People.tsx";

/** Profile, targets and today's logs; reloads whenever the screen gains focus. */
export function useToday() {
  const db = useSQLiteContext();
  const { people } = usePeople();
  const date = today();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [streak, setStreak] = useState(0);
  const [overrides, setOverrides] = useState<PlanOverride[]>([]);
  const [water, setWater] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setProfile(await getProfile(db));
    setLogs(await getLogs(db, date));
    setStreak(loggingStreak(await getLoggedDates(db), date));
    setOverrides(await getOverrides(db, date));
    setWater(await getWater(db, date));
    setLoaded(true);
    syncReminders(db);
    void publishFamily(people);
  }, [db, date, people]);

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

  return {
    db,
    date,
    profile,
    logs,
    targets,
    consumed,
    streak,
    overrides,
    water,
    loaded,
    reload,
  };
}
