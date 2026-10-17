import { useEffect, useMemo, useState } from "react";
import { Redirect } from "expo-router";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  addLogs,
  deleteBatch,
  getOverrides,
  resetOverride,
  saveOverride,
} from "../../src/db/db.ts";
import { FOOD_BY_ID } from "../../src/domain/foods.ts";
import { describeServing, formatQty } from "../../src/domain/nutrition.ts";
import {
  applyOverrides,
  buildDayPlan,
  dayNumber,
  groceryList,
  type GroceryItem,
} from "../../src/domain/plan.ts";
import type {
  MealOption,
  PlanOverride,
  SlotId,
  SlotPlan,
} from "../../src/domain/types.ts";
import { useToday } from "../../src/hooks/useToday.ts";
import { EditMealSheet } from "../../src/ui/EditMealSheet.tsx";
import { haptic } from "../../src/ui/haptics.ts";
import { Loading } from "../../src/ui/Loading.tsx";
import { Sheet, sheetStyles } from "../../src/ui/Sheet.tsx";
import { useToast } from "../../src/ui/Toast.tsx";
import { card, colors } from "../../src/ui/theme.ts";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Monday-to-Sunday dates of the week containing `date`. */
function weekOf(date: string): string[] {
  const d = new Date(`${date}T00:00`);
  const monday = d.getDate() - ((d.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, i) =>
    ymd(new Date(d.getFullYear(), d.getMonth(), monday + i)),
  );
}

export default function PlanScreen() {
  const { db, date, profile, targets, logs, loaded, reload } = useToday();
  const [picked, setPicked] = useState<Partial<Record<SlotId, number>>>({});
  const [day, setDay] = useState(date);
  const week = useMemo(() => weekOf(date), [date]);
  const isToday = day === date;
  const [overrides, setOverrides] = useState<PlanOverride[]>([]);
  const [rev, setRev] = useState(0);
  const [editing, setEditing] = useState<{
    slot: SlotPlan;
    option: MealOption;
  } | null>(null);
  const [groceries, setGroceries] = useState<GroceryItem[] | null>(null);
  const toast = useToast();

  useEffect(() => {
    getOverrides(db, day).then(setOverrides);
  }, [db, day, rev]);

  const plan = useMemo(
    () =>
      profile && targets
        ? applyOverrides(
            buildDayPlan(
              targets.kcal,
              profile.dietType,
              dayNumber(day),
              3,
              true,
            ),
            overrides,
          )
        : [],
    [profile, targets, day, overrides],
  );

  if (!loaded) return <Loading />;
  if (!profile || !targets) return <Redirect href="/onboarding" />;

  const dayTotals = plan.reduce(
    (s, slot) => {
      const o =
        slot.options[Math.min(picked[slot.slot] ?? 0, slot.options.length - 1)];
      return o
        ? {
            kcal: s.kcal + o.totals.kcal,
            protein: s.protein + o.totals.protein,
          }
        : s;
    },
    { kcal: 0, protein: 0 },
  );

  const openGroceries = async () => {
    haptic.tap();
    const perDay = await Promise.all(week.map((d) => getOverrides(db, d)));
    const days = week.map((d, i) =>
      applyOverrides(
        buildDayPlan(targets.kcal, profile.dietType, dayNumber(d), 3, true),
        perDay[i],
      ),
    );
    setGroceries(groceryList(days));
  };

  const logOption = async (
    slotId: SlotId,
    label: string,
    option: MealOption,
  ) => {
    const batchId = `${Date.now()}-${slotId}`;
    await addLogs(
      db,
      date,
      option.items.map((it) => ({
        slot: slotId,
        foodId: it.food.id,
        qty: it.qty,
      })),
      batchId,
    );
    haptic.success();
    reload();
    toast(`${label} logged`, {
      label: "Undo",
      onPress: () => deleteBatch(db, batchId).then(reload),
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingVertical: 16 }}
    >
      <View style={styles.week}>
        {week.map((d) => {
          const dt = new Date(`${d}T00:00`);
          const active = d === day;
          return (
            <Pressable
              key={d}
              onPress={() => {
                setDay(d);
                setPicked({});
              }}
              style={[styles.dayChip, active && styles.dayChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={dt.toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            >
              <Text style={[styles.dayName, active && { color: "#fff" }]}>
                {dt.toLocaleDateString(undefined, { weekday: "short" })}
              </Text>
              <Text style={[styles.dayNum, active && { color: "#fff" }]}>
                {dt.getDate()}
              </Text>
              {d === date && (
                <View
                  style={[styles.dot, active && { backgroundColor: "#fff" }]}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={[card, styles.summary]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.slotTitle}>
            {Math.round(dayTotals.kcal)} kcal planned
          </Text>
          <Text
            style={[
              styles.muted,
              dayTotals.protein >= targets.protein * 0.9 && {
                color: colors.primaryText,
                fontWeight: "700",
              },
            ]}
          >
            Protein {Math.round(dayTotals.protein)} / {targets.protein} g
            {dayTotals.protein >= targets.protein * 0.9 ? " ✓" : ""}
          </Text>
        </View>
        <Pressable
          style={styles.groceryBtn}
          onPress={openGroceries}
          accessibilityRole="button"
        >
          <Text style={styles.groceryText}>🛒 Week's groceries</Text>
        </Pressable>
      </View>

      {plan.map((slot) => {
        if (!slot.options.length) return null;
        const idx = Math.min(picked[slot.slot] ?? 0, slot.options.length - 1);
        const opt = slot.options[idx];
        const slotLogs = isToday
          ? logs.filter((l) => l.slot === slot.slot)
          : [];
        const batch = slotLogs.find((l) => l.batch_id)?.batch_id;
        const t = opt.totals;
        return (
          <View key={slot.slot} style={card}>
            <View style={styles.titleRow}>
              <Text style={[styles.slotTitle, { flex: 1 }]}>
                {slot.label}
                {opt.edited ? (
                  <Text style={styles.edited}> • Edited</Text>
                ) : null}
              </Text>
              <Pressable
                hitSlop={12}
                onPress={() => setEditing({ slot, option: opt })}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${slot.label}`}
              >
                <Text style={styles.editBtn}>✏️ Edit</Text>
              </Pressable>
            </View>
            <Text style={styles.muted}>
              {Math.round(t.kcal)} kcal · P {Math.round(t.protein)}g · C{" "}
              {Math.round(t.carbs)}g · F {Math.round(t.fat)}g
            </Text>

            {slot.options.length > 1 && (
              <View style={styles.pills}>
                {slot.options.map((_, n) => (
                  <Pressable
                    key={n}
                    onPress={() => setPicked((p) => ({ ...p, [slot.slot]: n }))}
                    style={[styles.pill, n === idx && styles.pillActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: n === idx }}
                    accessibilityLabel={`${slot.label} option ${n + 1}`}
                  >
                    <Text
                      style={[styles.pillText, n === idx && { color: "#fff" }]}
                    >
                      Option {n + 1}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {opt.items.map((it) => (
              <View key={it.food.id} style={styles.item}>
                <Text style={styles.itemName}>{it.food.name}</Text>
                <Text style={styles.muted}>
                  {describeServing(it.food, it.qty)} ·{" "}
                  {Math.round(it.macros.kcal)} kcal · P{" "}
                  {Math.round(it.macros.protein)} g
                </Text>
              </View>
            ))}

            {!isToday ? null : batch ? (
              <View style={styles.loggedRow}>
                <Text style={[styles.log, { color: colors.muted }]}>
                  ✓ Logged for today
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => deleteBatch(db, batch).then(reload)}
                >
                  <Text style={styles.log}>Undo</Text>
                </Pressable>
              </View>
            ) : slotLogs.length ? (
              <Text style={[styles.log, { color: colors.muted }]}>
                ✓ Logged · edit it on Today
              </Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`I ate ${slot.label} option ${idx + 1}`}
                onPress={() => logOption(slot.slot, slot.label, opt)}
              >
                <Text style={styles.log}>✓ I ate this</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <Text
        style={[styles.muted, { textAlign: "center", paddingHorizontal: 24 }]}
      >
        Nutrition values are approximate home-style estimates.
      </Text>

      <EditMealSheet
        option={editing?.option ?? null}
        title={editing?.slot.label ?? ""}
        targetKcal={editing?.slot.targetKcal ?? 0}
        diet={profile.dietType}
        onClose={() => setEditing(null)}
        onSave={async (items, everyDay) => {
          if (!editing) return;
          const base = {
            slot: editing.slot.slot,
            templateId: editing.option.templateId,
            items,
          };
          // "Every day" also drops this day's own edit so the new one shows.
          if (everyDay)
            await resetOverride(db, base.slot, base.templateId, day);
          await saveOverride(db, { ...base, date: everyDay ? "" : day });
          haptic.success();
          toast(everyDay ? "Saved for every day" : "Saved for this day");
          setEditing(null);
          setRev((r) => r + 1);
        }}
        onReset={async () => {
          if (!editing) return;
          await resetOverride(
            db,
            editing.slot.slot,
            editing.option.templateId,
            day,
          );
          setEditing(null);
          setRev((r) => r + 1);
        }}
      />

      <Sheet visible={!!groceries} onClose={() => setGroceries(null)}>
        <Text style={sheetStyles.title}>🛒 This week's groceries</Text>
        <Text style={sheetStyles.sub}>
          For Option 1 of every meal, Mon–Sun, including your edits.
        </Text>
        <ScrollView style={{ maxHeight: 380, marginTop: 12 }}>
          {groceries?.map((g) => (
            <View key={g.foodId} style={styles.groceryRow}>
              <Text style={[styles.itemName, { flex: 1 }]}>{g.name}</Text>
              <Text style={styles.muted}>
                {FOOD_BY_ID[g.foodId]
                  ? formatQty(FOOD_BY_ID[g.foodId], g.qty)
                  : g.qty}{" "}
                · ≈
                {g.grams >= 1000
                  ? ` ${(g.grams / 1000).toFixed(1)} kg`
                  : ` ${Math.round(g.grams)} g`}
              </Text>
            </View>
          ))}
        </ScrollView>
        <Pressable
          style={sheetStyles.save}
          onPress={() =>
            Share.share({
              message:
                "Thali groceries this week (cooked amounts):\n" +
                (groceries ?? [])
                  .map(
                    (g) =>
                      `• ${g.name}: ${FOOD_BY_ID[g.foodId] ? formatQty(FOOD_BY_ID[g.foodId], g.qty) : g.qty}`,
                  )
                  .join("\n"),
            })
          }
        >
          <Text style={sheetStyles.saveText}>Share list</Text>
        </Pressable>
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  summary: { flexDirection: "row", alignItems: "center", gap: 12 },
  groceryBtn: {
    backgroundColor: colors.tint,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  groceryText: { color: colors.tintText, fontWeight: "700", fontSize: 13 },
  groceryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.track,
  },
  muted: { fontSize: 13, color: colors.muted },
  slotTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  pills: { flexDirection: "row", gap: 8, marginVertical: 12 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: colors.track,
  },
  pillActive: { backgroundColor: colors.primary },
  pillText: { fontSize: 14, fontWeight: "600", color: colors.text },
  item: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.track,
  },
  itemName: { fontSize: 14, color: colors.text, fontWeight: "500" },
  log: { color: colors.primaryText, fontWeight: "700", paddingTop: 10 },
  titleRow: { flexDirection: "row", alignItems: "center" },
  edited: { fontSize: 12, color: colors.warnText, fontWeight: "700" },
  editBtn: { color: colors.primaryText, fontWeight: "700", fontSize: 13 },
  loggedRow: { flexDirection: "row", justifyContent: "space-between" },
  week: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 12,
  },
  dayChip: {
    width: 44,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: colors.card,
  },
  dayChipActive: { backgroundColor: colors.primary },
  dayName: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  dayNum: { fontSize: 16, color: colors.text, fontWeight: "700" },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
    backgroundColor: colors.primary,
  },
});
