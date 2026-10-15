import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getProfile, logWeight, saveProfile, today } from "../src/db/db.ts";
import { goalAdvice, targetOptions } from "../src/domain/bmi.ts";
import { calorieTarget, GOALS, macroTargets } from "../src/domain/energy.ts";
import type { Goal, Macros, Profile } from "../src/domain/types.ts";
import { haptic } from "../src/ui/haptics.ts";
import { usePeople } from "../src/ui/People.tsx";
import {
  ACTIVITY,
  DIET,
  EMPTY,
  GAIN_PACE,
  GOAL_LABEL,
  PACE,
  SEX,
  toForm,
  toProfile,
  type Form,
} from "../src/ui/profileForm.ts";
import { card, colors } from "../src/ui/theme.ts";

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
          accessibilityRole="button"
          accessibilityState={{ selected: v === value }}
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
        accessibilityLabel={label}
      />
    </View>
  );
}

export default function EditProfile() {
  const db = useSQLiteContext();
  const { person, rename } = usePeople();
  const [form, setForm] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    before: number | null;
    after: number;
    m: Macros;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      getProfile(db).then((p) => {
        if (!p) return;
        setSaved(p);
        setForm(toForm(p));
      });
    }, [db]),
  );

  const set =
    <K extends keyof Form>(k: K) =>
    (v: Form[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

  const h = +form.heightCm;
  const w = +form.weightKg;
  const sized = h >= 120 && h <= 220 && w >= 30 && w <= 250;
  const options = sized ? targetOptions(form.goal, h, w) : [];
  const advice = sized ? goalAdvice(form.goal, h, w) : null;

  const pickGoal = (goal: Goal) => {
    const first = sized ? targetOptions(goal, h, w)[0] : undefined;
    setForm((f) => ({
      ...f,
      goal,
      targetWeightKg:
        goal === "maintain"
          ? f.weightKg
          : first
            ? String(first.kg)
            : f.targetWeightKg,
    }));
  };

  const onSave = async () => {
    const p = toProfile(form);
    if (typeof p === "string") {
      haptic.warn();
      return Alert.alert("Check your details", p);
    }
    setSaving(true);
    try {
      // Log first so the starting weight is captured before the profile changes.
      if (saved && p.weightKg !== saved.weightKg)
        await logWeight(db, today(), p.weightKg);
      await saveProfile(db, p);
      if (p.name) rename(person.id, p.name);
      haptic.success();
      const after = calorieTarget(p).kcal;
      setResult({
        before: saved ? calorieTarget(saved).kcal : null,
        after,
        m: macroTargets(p, after),
      });
      setSaved(p);
    } catch {
      Alert.alert("Could not save", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingVertical: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={card}>
        <Field
          label="Name"
          value={form.name}
          onChange={set("name")}
          numeric={false}
        />
        <Text style={styles.label}>My goal</Text>
        <Chips
          items={GOALS.map((g) => [g.id, `${g.emoji} ${GOAL_LABEL[g.id]}`])}
          value={form.goal}
          onChange={pickGoal}
        />
        {advice ? (
          <Text
            style={[styles.muted, { color: colors.warnText, marginTop: 8 }]}
          >
            {advice}
          </Text>
        ) : null}

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
          {form.goal !== "maintain" && (
            <Field
              label="Target (kg)"
              value={form.targetWeightKg}
              onChange={set("targetWeightKg")}
            />
          )}
        </View>
        {form.goal !== "maintain" && options.length > 0 && (
          <>
            <Text style={styles.label}>Suggested targets</Text>
            <Chips
              items={options.map((o) => [o.kg, `${o.kg} kg`])}
              value={+form.targetWeightKg}
              onChange={(kg) => set("targetWeightKg")(String(kg))}
            />
          </>
        )}
        <Text style={styles.label}>Activity</Text>
        <Chips
          items={ACTIVITY}
          value={form.activity}
          onChange={set("activity")}
        />
        <Text style={styles.label}>Diet</Text>
        <Chips items={DIET} value={form.dietType} onChange={set("dietType")} />
        {form.goal === "lose" && (
          <>
            <Text style={styles.label}>Pace</Text>
            <Chips
              items={PACE}
              value={form.weeklyLossKg}
              onChange={set("weeklyLossKg")}
            />
          </>
        )}
        {(form.goal === "gain" || form.goal === "muscle") && (
          <>
            <Text style={styles.label}>Pace</Text>
            <Chips
              items={GAIN_PACE}
              value={form.weeklyGainKg}
              onChange={set("weeklyGainKg")}
            />
          </>
        )}

        <Pressable
          onPress={onSave}
          disabled={saving}
          style={[styles.save, saving && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </Pressable>
        <Text style={[styles.muted, { marginTop: 10 }]}>
          Not medical advice. If you are pregnant, breastfeeding, diabetic or on
          medication, check with a doctor before following a plan.
        </Text>
      </View>

      <Modal
        visible={!!result}
        transparent
        animationType="slide"
        onRequestClose={() => setResult(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetEmoji}>🎉</Text>
            <Text style={styles.title}>
              {result?.before == null ? "Your plan is ready" : "Profile saved"}
            </Text>
            <Text style={styles.big}>{result?.after} kcal / day</Text>
            {result?.before != null && result.before !== result.after && (
              <Text style={styles.muted}>Was {result.before} kcal</Text>
            )}
            <Text style={[styles.muted, { marginTop: 8 }]}>
              Protein {result?.m.protein}g · Carbs {result?.m.carbs}g · Fats{" "}
              {result?.m.fat}g
            </Text>
            <Pressable
              style={[styles.save, { alignSelf: "stretch" }]}
              onPress={() => {
                setResult(null);
                router.dismissTo("/plan");
              }}
              accessibilityRole="button"
            >
              <Text style={styles.saveText}>See today's plan</Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => {
                setResult(null);
                router.back();
              }}
              accessibilityRole="button"
            >
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: 18,
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
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.4)",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    alignItems: "center",
  },
  sheetEmoji: { fontSize: 40, marginBottom: 8 },
  big: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.primaryText,
    marginTop: 8,
  },
  done: { color: colors.muted, fontWeight: "600", marginTop: 16 },
});
