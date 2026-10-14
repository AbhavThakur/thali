import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { addLogs, getProfile, today } from "../src/db/db.ts";
import { FOODS } from "../src/domain/foods.ts";
import { formatQty, isAllowed, macrosFor } from "../src/domain/nutrition.ts";
import { SLOTS } from "../src/domain/plan.ts";
import type { DietType, Food, SlotId } from "../src/domain/types.ts";
import { colors } from "../src/ui/theme.ts";

export default function AddFood() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ slot?: string }>();
  const slot = (SLOTS.find((s) => s.id === params.slot)?.id ??
    "snack") as SlotId;
  const [diet, setDiet] = useState<DietType>("non_vegetarian");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Food | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    getProfile(db).then((p) => p && setDiet(p.dietType));
  }, [db]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FOODS.filter(
      (f) => isAllowed(f, diet) && (!q || f.name.toLowerCase().includes(q)),
    );
  }, [query, diet]);

  const add = async () => {
    if (!selected) return;
    await addLogs(db, today(), [{ slot, foodId: selected.id, qty }]);
    router.back();
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.muted}>
        Adding to {SLOTS.find((s) => s.id === slot)?.label}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Search dal, roti, idli…"
        value={query}
        onChangeText={setQuery}
        autoFocus
      />
      <FlatList
        data={results}
        keyExtractor={(f) => f.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setSelected(item);
              setQty(1);
            }}
            style={[
              styles.row,
              selected?.id === item.id && { backgroundColor: "#ECFDF5" },
            ]}
          >
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.muted}>
              1 {item.measure.unit} · {Math.round(macrosFor(item, 1).kcal)} kcal
            </Text>
          </Pressable>
        )}
      />
      {selected && (
        <View style={styles.footer}>
          <Pressable
            onPress={() => setQty((q) => Math.max(0.5, q - 0.5))}
            style={styles.step}
          >
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.name}>{formatQty(selected, qty)}</Text>
            <Text style={styles.muted}>
              {Math.round(macrosFor(selected, qty).kcal)} kcal
            </Text>
          </View>
          <Pressable onPress={() => setQty((q) => q + 0.5)} style={styles.step}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
          <Pressable onPress={add} style={styles.addBtn}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Add</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  muted: { fontSize: 13, color: colors.muted },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    marginVertical: 12,
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.track,
    borderRadius: 8,
  },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.track,
  },
  step: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.track,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 20, fontWeight: "700", color: colors.text },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
});
