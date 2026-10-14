import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { addLogs } from "../../src/db/db.ts";
import { formatQty } from "../../src/domain/nutrition.ts";
import { buildDayPlan } from "../../src/domain/plan.ts";
import type { SlotId } from "../../src/domain/types.ts";
import { useToday } from "../../src/hooks/useToday.ts";
import { card, colors } from "../../src/ui/theme.ts";

const dayIndex = (date: string) =>
  Math.floor(new Date(`${date}T00:00`).getTime() / 86_400_000);

export default function PlanScreen() {
  const { db, date, profile, targets, logs, loaded, reload } = useToday();
  const [picked, setPicked] = useState<Partial<Record<SlotId, number>>>({});

  const plan = useMemo(
    () =>
      profile && targets
        ? buildDayPlan(targets.kcal, profile.dietType, dayIndex(date))
        : [],
    [profile, targets, date],
  );

  if (!loaded) return null;
  if (!profile || !targets) {
    return (
      <View style={[styles.screen, { padding: 24 }]}>
        <Text style={styles.muted}>Set up your profile first.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingVertical: 16 }}
    >
      {plan.map((slot) => {
        if (!slot.options.length) return null;
        const idx = Math.min(picked[slot.slot] ?? 0, slot.options.length - 1);
        const opt = slot.options[idx];
        const logged = logs.some((l) => l.slot === slot.slot);
        const t = opt.totals;
        return (
          <View key={slot.slot} style={card}>
            <Text style={styles.slotTitle}>{slot.label}</Text>
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
                  {formatQty(it.food, it.qty)} · {Math.round(it.macros.kcal)}{" "}
                  kcal
                </Text>
              </View>
            ))}

            <Pressable
              disabled={logged}
              onPress={() =>
                addLogs(
                  db,
                  date,
                  opt.items.map((it) => ({
                    slot: slot.slot,
                    foodId: it.food.id,
                    qty: it.qty,
                  })),
                ).then(reload)
              }
            >
              <Text style={[styles.log, logged && { color: colors.muted }]}>
                {logged ? "✓ Logged for today" : "✓ I ate this"}
              </Text>
            </Pressable>
          </View>
        );
      })}
      <Text
        style={[styles.muted, { textAlign: "center", paddingHorizontal: 24 }]}
      >
        Nutrition values are approximate home-style estimates.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  muted: { fontSize: 13, color: colors.muted },
  slotTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  pills: { flexDirection: "row", gap: 8, marginVertical: 12 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.track,
  },
  pillActive: { backgroundColor: colors.primary },
  pillText: { fontSize: 13, fontWeight: "600", color: colors.text },
  item: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.track,
  },
  itemName: { fontSize: 14, color: colors.text, fontWeight: "500" },
  log: { color: colors.primary, fontWeight: "700", paddingTop: 10 },
});
