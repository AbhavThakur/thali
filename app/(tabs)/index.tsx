import { Link, router } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { deleteLog } from "../../src/db/db.ts";
import { FOOD_BY_ID } from "../../src/domain/foods.ts";
import { formatQty, macrosFor } from "../../src/domain/nutrition.ts";
import { SLOTS } from "../../src/domain/plan.ts";
import { useToday } from "../../src/hooks/useToday.ts";
import { CalorieRing } from "../../src/ui/CalorieRing.tsx";
import { MacroBars } from "../../src/ui/MacroBars.tsx";
import { card, colors } from "../../src/ui/theme.ts";

export default function TodayScreen() {
  const { db, date, profile, logs, targets, consumed, loaded, reload } = useToday();

  if (!loaded) return null;
  if (!profile || !targets) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.title}>Welcome to Thali</Text>
        <Text style={styles.muted}>Set up your profile to get your calorie target and diet plan.</Text>
        <Link href="/profile" style={styles.cta}>
          Set up profile
        </Link>
      </View>
    );
  }

  const remove = (id: number, name: string) =>
    Alert.alert("Remove item?", name, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deleteLog(db, id).then(reload) },
    ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingVertical: 16 }}>
      <View style={card}>
        <Text style={styles.muted}>
          {new Date(`${date}T00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
        </Text>
        <View style={styles.summary}>
          <CalorieRing consumed={consumed.kcal} target={targets.kcal} />
          <MacroBars consumed={consumed} target={targets} />
        </View>
      </View>

      {SLOTS.map((slot) => {
        const rows = logs.filter((l) => l.slot === slot.id && FOOD_BY_ID[l.food_id]);
        const kcal = rows.reduce((s, l) => s + macrosFor(FOOD_BY_ID[l.food_id], l.qty).kcal, 0);
        return (
          <View key={slot.id} style={card}>
            <View style={styles.slotHeader}>
              <Text style={styles.slotTitle}>{slot.label}</Text>
              <Text style={styles.muted}>{Math.round(kcal)} kcal</Text>
            </View>
            {rows.map((l) => {
              const food = FOOD_BY_ID[l.food_id];
              return (
                <Pressable key={l.id} onLongPress={() => remove(l.id, food.name)} style={styles.item}>
                  <Text style={styles.itemName}>{food.name}</Text>
                  <Text style={styles.muted}>
                    {formatQty(food, l.qty)} · {Math.round(macrosFor(food, l.qty).kcal)} kcal
                  </Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => router.push({ pathname: "/add", params: { slot: slot.id } })}>
              <Text style={styles.add}>+ Add food</Text>
            </Pressable>
          </View>
        );
      })}
      <Text style={[styles.muted, { textAlign: "center" }]}>Long-press an item to remove it.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  cta: { marginTop: 8, color: "#fff", backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, fontWeight: "600", overflow: "hidden" },
  summary: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12 },
  slotHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  slotTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  item: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.track },
  itemName: { fontSize: 14, color: colors.text, fontWeight: "500" },
  add: { color: colors.primary, fontWeight: "600", paddingTop: 8 },
});
