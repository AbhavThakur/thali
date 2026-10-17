import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { allFoods, FOOD_BY_ID } from "../domain/foods.ts";
import { describeServing, isAllowed } from "../domain/nutrition.ts";
import { optionFromItems } from "../domain/plan.ts";
import type { DietType, MealOption, PlanItemInput } from "../domain/types.ts";
import { colors } from "./theme.ts";

const STEP = 0.5;

export function EditMealSheet({
  option,
  title,
  targetKcal,
  diet,
  onClose,
  onSave,
  onReset,
}: {
  option: MealOption | null;
  title: string;
  targetKcal: number;
  diet: DietType;
  onClose: () => void;
  onSave: (items: PlanItemInput[], everyDay: boolean) => void;
  onReset: () => void;
}) {
  const [items, setItems] = useState<PlanItemInput[]>([]);
  const [everyDay, setEveryDay] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!option) return;
    setItems(option.items.map((it) => ({ foodId: it.food.id, qty: it.qty })));
    setEveryDay(false);
    setQuery("");
  }, [option]);

  const preview = useMemo(
    () => optionFromItems(option?.templateId ?? "", items),
    [option, items],
  );
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allFoods()
      .filter(
        (f) =>
          isAllowed(f, diet) &&
          f.name.toLowerCase().includes(q) &&
          !items.some((it) => it.foodId === f.id),
      )
      .slice(0, 6);
  }, [query, diet, items]);

  const change = (foodId: string, delta: number) =>
    setItems((list) =>
      list.map((it) =>
        it.foodId === foodId
          ? { ...it, qty: Math.max(STEP, it.qty + delta) }
          : it,
      ),
    );

  const kcal = Math.round(preview.totals.kcal);
  const diff = kcal - targetKcal;
  const near = Math.abs(diff) <= targetKcal * 0.15;

  return (
    <Modal
      visible={!!option}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.title}>Edit {title}</Text>
          <View style={[styles.total, !near && styles.totalOff]}>
            <Text style={styles.totalText}>
              {kcal} kcal · target {targetKcal}
              {near ? "  ✓" : diff > 0 ? `  (+${diff})` : `  (${diff})`}
            </Text>
            <Text style={styles.muted}>
              P {Math.round(preview.totals.protein)}g · C{" "}
              {Math.round(preview.totals.carbs)}g · F{" "}
              {Math.round(preview.totals.fat)}g
            </Text>
          </View>

          <ScrollView
            style={{ maxHeight: 320 }}
            keyboardShouldPersistTaps="handled"
          >
            {items.map((it) => {
              const food = FOOD_BY_ID[it.foodId];
              if (!food) return null;
              return (
                <View key={it.foodId} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{food.name}</Text>
                    <Text style={styles.muted}>
                      {describeServing(food, it.qty)}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.step}
                    hitSlop={6}
                    onPress={() => change(it.foodId, -STEP)}
                    accessibilityRole="button"
                    accessibilityLabel={`Less ${food.name}`}
                  >
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text style={styles.qty}>{it.qty}</Text>
                  <Pressable
                    style={styles.step}
                    hitSlop={6}
                    onPress={() => change(it.foodId, STEP)}
                    accessibilityRole="button"
                    accessibilityLabel={`More ${food.name}`}
                  >
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                  <Pressable
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${food.name}`}
                    onPress={() =>
                      setItems((l) => l.filter((x) => x.foodId !== it.foodId))
                    }
                  >
                    <Text style={styles.remove}>✕</Text>
                  </Pressable>
                </View>
              );
            })}

            <TextInput
              style={styles.search}
              placeholder="+ Add a food (search dal, roti…)"
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
            />
            {results.map((f) => (
              <Pressable
                key={f.id}
                style={styles.result}
                onPress={() => {
                  setItems((l) => [...l, { foodId: f.id, qty: 1 }]);
                  setQuery("");
                }}
              >
                <Text style={styles.name}>{f.name}</Text>
                <Text style={styles.muted}>{describeServing(f, 1)}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.scope}>
            {[
              [false, "Only this day"],
              [true, "Every day"],
            ].map(([v, label]) => (
              <Pressable
                key={String(v)}
                onPress={() => setEveryDay(v as boolean)}
                style={[styles.chip, everyDay === v && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, everyDay === v && { color: "#fff" }]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.save, !preview.items.length && { opacity: 0.5 }]}
            disabled={!preview.items.length}
            onPress={() => onSave(items, everyDay)}
          >
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
          <View style={styles.footer}>
            {option?.edited ? (
              <Pressable hitSlop={8} onPress={onReset}>
                <Text style={styles.link}>Reset to suggested</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable hitSlop={8} onPress={onClose}>
              <Text style={[styles.link, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  grab: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.track,
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  total: {
    backgroundColor: colors.tint,
    borderRadius: 12,
    padding: 12,
    marginVertical: 12,
  },
  totalOff: { backgroundColor: colors.warnTint },
  totalText: { fontSize: 15, fontWeight: "700", color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.track,
  },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  step: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.track,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 18, fontWeight: "700", color: colors.text },
  qty: {
    minWidth: 28,
    textAlign: "center",
    fontWeight: "700",
    color: colors.text,
  },
  remove: { fontSize: 14, color: colors.muted, paddingLeft: 6 },
  search: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  result: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.track,
  },
  scope: { flexDirection: "row", gap: 8, marginTop: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.track,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.text },
  save: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  link: { color: colors.primaryText, fontWeight: "700" },
});
