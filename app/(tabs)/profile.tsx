import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getProfile, saveProfile } from "../../src/db/db.ts";
import { bmr, calorieTarget, macroTargets } from "../../src/domain/energy.ts";
import type {
  ActivityLevel,
  DietType,
  Profile,
  Sex,
} from "../../src/domain/types.ts";
import { card, colors } from "../../src/ui/theme.ts";

const SEX: [Sex, string][] = [
  ["female", "Female"],
  ["male", "Male"],
];
const ACTIVITY: [ActivityLevel, string][] = [
  ["sedentary", "Desk job"],
  ["light", "Light"],
  ["moderate", "Moderate"],
  ["active", "Active"],
  ["very_active", "Very active"],
];
const DIET: [DietType, string][] = [
  ["vegetarian", "Veg"],
  ["eggetarian", "Egg"],
  ["non_vegetarian", "Non-veg"],
  ["vegan", "Vegan"],
  ["jain", "Jain"],
];
const PACE: [number, string][] = [
  [0.25, "0.25 kg/wk"],
  [0.5, "0.5 kg/wk"],
  [0.75, "0.75 kg/wk"],
];

type Form = Omit<
  Profile,
  "age" | "heightCm" | "weightKg" | "targetWeightKg"
> & {
  age: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
};

const EMPTY: Form = {
  name: "",
  sex: "female",
  age: "",
  heightCm: "",
  weightKg: "",
  targetWeightKg: "",
  activity: "light",
  dietType: "vegetarian",
  weeklyLossKg: 0.5,
};

function toProfile(f: Form): Profile | string {
  const n = {
    age: +f.age,
    heightCm: +f.heightCm,
    weightKg: +f.weightKg,
    targetWeightKg: +f.targetWeightKg,
  };
  if (!(n.age >= 18 && n.age <= 80))
    return "Age must be 18–80. This app is not for children or teens.";
  if (!(n.heightCm >= 120 && n.heightCm <= 220))
    return "Height must be 120–220 cm.";
  if (!(n.weightKg >= 30 && n.weightKg <= 250))
    return "Weight must be 30–250 kg.";
  if (!(n.targetWeightKg >= 30 && n.targetWeightKg < n.weightKg))
    return "Target weight must be below current weight.";
  return { ...f, name: f.name.trim(), ...n };
}

function Chips<T extends string | number>({
  items,
  value,
  onChange,
}: {
  items: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {items.map(([v, label]) => (
        <Pressable
          key={String(v)}
          onPress={() => onChange(v)}
          style={[styles.chip, v === value && styles.chipActive]}
        >
          <Text style={[styles.chipText, v === value && { color: "#fff" }]}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  numeric = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? "decimal-pad" : "default"}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const db = useSQLiteContext();
  const [form, setForm] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState<Profile | null>(null);

  useEffect(() => {
    getProfile(db).then((p) => {
      if (!p) return;
      setSaved(p);
      setForm({
        ...p,
        age: String(p.age),
        heightCm: String(p.heightCm),
        weightKg: String(p.weightKg),
        targetWeightKg: String(p.targetWeightKg),
      });
    });
  }, [db]);

  const set =
    <K extends keyof Form>(k: K) =>
    (v: Form[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

  const summary = useMemo(() => {
    if (!saved) return null;
    const t = calorieTarget(saved);
    return { t, m: macroTargets(saved, t.kcal), bmr: Math.round(bmr(saved)) };
  }, [saved]);

  const onSave = async () => {
    const p = toProfile(form);
    if (typeof p === "string") return Alert.alert("Check your details", p);
    await saveProfile(db, p);
    setSaved(p);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingVertical: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {summary && (
        <View style={card}>
          <Text style={styles.title}>{summary.t.kcal} kcal / day</Text>
          <Text style={styles.muted}>
            BMR {summary.bmr} · Maintenance {summary.t.tdee} · Deficit{" "}
            {summary.t.deficit}
          </Text>
          <Text style={styles.muted}>
            Protein {summary.m.protein}g · Carbs {summary.m.carbs}g · Fats{" "}
            {summary.m.fat}g · Fiber {summary.m.fiber}g
          </Text>
          {summary.t.clampedToFloor && (
            <Text style={[styles.muted, { color: colors.warn, marginTop: 6 }]}>
              Target held at the safe minimum. Weight loss will be slower than
              the pace you picked.
            </Text>
          )}
        </View>
      )}

      <View style={card}>
        <Field
          label="Name"
          value={form.name}
          onChange={set("name")}
          numeric={false}
        />
        <Text style={styles.label}>Sex</Text>
        <Chips items={SEX} value={form.sex} onChange={set("sex")} />
        <View style={styles.row}>
          <Field label="Age" value={form.age} onChange={set("age")} />
          <Field
            label="Height (cm)"
            value={form.heightCm}
            onChange={set("heightCm")}
          />
        </View>
        <View style={styles.row}>
          <Field
            label="Weight (kg)"
            value={form.weightKg}
            onChange={set("weightKg")}
          />
          <Field
            label="Target (kg)"
            value={form.targetWeightKg}
            onChange={set("targetWeightKg")}
          />
        </View>
        <Text style={styles.label}>Activity</Text>
        <Chips
          items={ACTIVITY}
          value={form.activity}
          onChange={set("activity")}
        />
        <Text style={styles.label}>Diet</Text>
        <Chips items={DIET} value={form.dietType} onChange={set("dietType")} />
        <Text style={styles.label}>Pace</Text>
        <Chips
          items={PACE}
          value={form.weeklyLossKg}
          onChange={set("weeklyLossKg")}
        />

        <Pressable onPress={onSave} style={styles.save}>
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
        <Text style={[styles.muted, { marginTop: 10 }]}>
          Not medical advice. If you are pregnant, breastfeeding, diabetic or on
          medication, check with a doctor before following a plan.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  muted: { fontSize: 13, color: colors.muted },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  row: { flexDirection: "row", gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.track,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.text },
  save: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
