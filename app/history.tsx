import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  deleteLog,
  getAllLogs,
  getProfile,
  getWaterHistory,
  getWeights,
  today,
  type LogRow,
  type WeightRow,
} from "../src/db/db.ts";
import { calorieTarget, macroTargets } from "../src/domain/energy.ts";
import {
  buildHistory,
  periodStats,
  shiftDate,
  type HistoryDay,
} from "../src/domain/history.ts";
import { formatQty } from "../src/domain/nutrition.ts";
import { FOOD_BY_ID } from "../src/domain/foods.ts";
import { SLOTS } from "../src/domain/plan.ts";
import type { Macros } from "../src/domain/types.ts";
import { WATER_GOAL } from "../src/hooks/useProgress.ts";
import { haptic } from "../src/ui/haptics.ts";
import { Mascot } from "../src/ui/Mascot.tsx";
import { card, colors } from "../src/ui/theme.ts";

const RANGES = [
  [7, "7 days"],
  [30, "30 days"],
  [90, "3 months"],
] as const;

function dayLabel(date: string, now: string) {
  if (date === now) return "Today";
  if (date === shiftDate(now, -1)) return "Yesterday";
  return new Date(`${date}T00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ date?: string }>();
  const now = today();
  const focus = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "")
    ? (params.date as string)
    : null;

  const [range, setRange] = useState<number>(
    focus && focus < shiftDate(now, -6) ? 30 : 7,
  );
  const [open, setOpen] = useState<string | null>(focus);
  const [data, setData] = useState<{
    logs: LogRow[];
    water: { date: string; glasses: number }[];
    weights: WeightRow[];
    target: Macros;
  } | null>(null);
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    const profile = await getProfile(db);
    if (!profile) return;
    const [logs, water, weights] = await Promise.all([
      getAllLogs(db),
      getWaterHistory(db),
      getWeights(db),
    ]);
    setData({
      logs,
      water,
      weights,
      target: macroTargets(profile, calorieTarget(profile).kcal),
    });
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const days = useMemo(
    () => (data ? buildHistory(data, shiftDate(now, -(range - 1)), now) : []),
    [data, range, now],
  );
  const stats = useMemo(() => periodStats(days), [days]);

  const jumpToFocus = (date: string) => {
    const y = offsets.current[date];
    if (focus === date && y != null)
      scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

  const remove = (id: number, name: string) =>
    Alert.alert("Remove item?", name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await deleteLog(db, id);
          haptic.tap();
          load();
        },
      },
    ]);

  if (!data)
    return (
      <View style={[styles.screen, styles.center]}>
        <Mascot mood="thinking" />
        <Text style={styles.muted}>Loading your history…</Text>
      </View>
    );

  return (
    <ScrollView
      ref={scroll}
      style={styles.screen}
      contentContainerStyle={{ paddingVertical: 16 }}
    >
      <View style={styles.chips}>
        {RANGES.map(([n, label]) => (
          <Pressable
            key={n}
            onPress={() => setRange(n)}
            style={[styles.chip, range === n && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: range === n }}
          >
            <Text style={[styles.chipText, range === n && { color: "#fff" }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={[card, styles.summary]}>
        {[
          [`${stats.loggedDays}/${stats.days}`, "days logged"],
          [stats.loggedDays ? stats.avgKcal.toLocaleString() : "–", "avg kcal"],
          [stats.loggedDays ? `${stats.avgProtein} g` : "–", "avg protein"],
          [String(stats.onTargetDays), "on target"],
          [`⭐ ${stats.stars}`, "stars"],
          [
            stats.weightChangeKg == null
              ? "–"
              : `${stats.weightChangeKg > 0 ? "+" : ""}${stats.weightChangeKg} kg`,
            "weight",
          ],
        ].map(([v, l]) => (
          <View key={l} style={styles.sumItem}>
            <Text style={styles.sumValue}>{v}</Text>
            <Text style={styles.sumLabel}>{l}</Text>
          </View>
        ))}
      </View>

      {days.map((d) => (
        <DayCard
          key={d.date}
          day={d}
          now={now}
          target={data.target}
          open={open === d.date}
          onToggle={() => {
            haptic.tap();
            setOpen(open === d.date ? null : d.date);
          }}
          onLayoutY={(y) => {
            offsets.current[d.date] = y;
            jumpToFocus(d.date);
          }}
          onRemove={remove}
        />
      ))}
    </ScrollView>
  );
}

function DayCard({
  day,
  now,
  target,
  open,
  onToggle,
  onLayoutY,
  onRemove,
}: {
  day: HistoryDay;
  now: string;
  target: Macros;
  open: boolean;
  onToggle: () => void;
  onLayoutY: (y: number) => void;
  onRemove: (id: number, name: string) => void;
}) {
  const pct = Math.min(1, day.totals.kcal / target.kcal);
  const over = day.totals.kcal > target.kcal * 1.1;
  return (
    <View style={card} onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${dayLabel(day.date, now)}, ${day.logged ? `${Math.round(day.totals.kcal)} kcal` : "nothing logged"}`}
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.head}>
          <Text style={styles.date}>{dayLabel(day.date, now)}</Text>
          <Text style={[styles.kcal, !day.logged && { color: colors.muted }]}>
            {day.logged
              ? `${Math.round(day.totals.kcal).toLocaleString()} / ${target.kcal.toLocaleString()} kcal`
              : "Nothing logged"}
          </Text>
        </View>
        <View style={styles.bar}>
          <View
            style={[
              styles.barFill,
              {
                width: `${pct * 100}%`,
                backgroundColor: over ? colors.warn : colors.primary,
              },
            ]}
          />
        </View>
        <View style={styles.meta}>
          {day.stars && (
            <Text style={styles.metaText}>
              {"⭐".repeat(day.stars.stars)}
              <Text style={{ opacity: 0.25 }}>
                {"⭐".repeat(3 - day.stars.stars)}
              </Text>
            </Text>
          )}
          {day.water > 0 && (
            <Text style={styles.metaText}>
              💧 {day.water}/{WATER_GOAL}
            </Text>
          )}
          {day.weightKg != null && (
            <Text style={styles.metaText}>⚖️ {day.weightKg} kg</Text>
          )}
          <Text style={[styles.metaText, { marginLeft: "auto" }]}>
            {open ? "▲" : "▼"}
          </Text>
        </View>
      </Pressable>

      {open && (
        <View style={styles.detail}>
          {day.logged && (
            <Text style={styles.macros}>
              Protein {Math.round(day.totals.protein)} g · Carbs{" "}
              {Math.round(day.totals.carbs)} g · Fats{" "}
              {Math.round(day.totals.fat)} g
            </Text>
          )}
          {SLOTS.map((s) => {
            const meal = day.meals.find((m) => m.slot === s.id);
            return (
              <View key={s.id} style={styles.slot}>
                <View style={styles.slotHead}>
                  <Text style={styles.slotName}>
                    {s.label}
                    {meal ? (
                      <Text style={styles.muted}>
                        {" "}
                        {Math.round(meal.kcal)} kcal
                      </Text>
                    ) : null}
                  </Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      router.push({
                        pathname: "/add",
                        params: { slot: s.id, date: day.date },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Add food to ${s.label} on ${dayLabel(day.date, now)}`}
                  >
                    <Text style={styles.add}>+ Add</Text>
                  </Pressable>
                </View>
                {meal?.items.map((it) => (
                  <View key={it.logId} style={styles.item}>
                    <Text style={styles.itemName}>{it.name}</Text>
                    <Text style={styles.muted}>
                      {FOOD_BY_ID[it.foodId]
                        ? formatQty(FOOD_BY_ID[it.foodId], it.qty)
                        : it.qty}{" "}
                      · {Math.round(it.kcal)} kcal
                    </Text>
                    <Pressable
                      hitSlop={10}
                      onPress={() => onRemove(it.logId, it.name)}
                      accessibilityLabel={`Remove ${it.name}`}
                    >
                      <Text style={styles.x}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { fontSize: 12, color: colors.muted },
  chips: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.track,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.text },
  summary: { flexDirection: "row", flexWrap: "wrap", rowGap: 14 },
  sumItem: { width: "33.33%", alignItems: "center" },
  sumValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  sumLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
    marginTop: 2,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  date: { fontSize: 16, fontWeight: "800", color: colors.text },
  kcal: { fontSize: 13, fontWeight: "700", color: colors.text },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    marginTop: 8,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: 3 },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 8,
    minHeight: 18,
  },
  metaText: { fontSize: 13, color: colors.text, fontWeight: "600" },
  detail: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.track,
    paddingTop: 10,
  },
  macros: { fontSize: 12, color: colors.muted, marginBottom: 6 },
  slot: { paddingVertical: 6 },
  slotHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  slotName: { fontSize: 14, fontWeight: "700", color: colors.text },
  add: { color: colors.primaryText, fontWeight: "700", fontSize: 13 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
    paddingLeft: 8,
  },
  itemName: { flex: 1, fontSize: 14, color: colors.text },
  x: { fontSize: 14, color: colors.muted, paddingHorizontal: 4 },
});
