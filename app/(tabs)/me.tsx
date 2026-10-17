import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  exportBackup,
  getProfile,
  getSetting,
  importBackup,
  loadCustomFoods,
  resetAll,
  setSetting,
} from "../../src/db/db.ts";
import { bmr, calorieTarget, macroTargets } from "../../src/domain/energy.ts";
import { registerCustomFoods } from "../../src/domain/foods.ts";
import type { Health, Profile } from "../../src/domain/types.ts";
import { haptic } from "../../src/ui/haptics.ts";
import { Mascot } from "../../src/ui/Mascot.tsx";
import { PeopleSheet, usePeople } from "../../src/ui/People.tsx";
import { GOAL_LABEL } from "../../src/ui/profileForm.ts";
import { loadSession } from "../../src/ui/cloudSync.ts";
import { Sheet, sheetStyles } from "../../src/ui/Sheet.tsx";
import {
  card,
  colors,
  getThemeMode,
  setThemeMode,
  type ThemeMode,
} from "../../src/ui/theme.ts";

type Row = { emoji: string; label: string; sub?: string; onPress: () => void };

function Menu({ title, rows }: { title?: string; rows: Row[] }) {
  return (
    <View style={card}>
      {title ? <Text style={styles.section}>{title}</Text> : null}
      {rows.map((r, i) => (
        <Pressable
          key={r.label}
          style={[styles.menuRow, i === 0 && !title && styles.menuFirst]}
          onPress={r.onPress}
          accessibilityRole="button"
          accessibilityLabel={r.sub ? `${r.label}. ${r.sub}` : r.label}
        >
          <Text style={{ fontSize: 20 }}>{r.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.menuText,
                r.label.startsWith("Delete") && { color: colors.danger },
              ]}
            >
              {r.label}
            </Text>
            {r.sub ? <Text style={styles.muted}>{r.sub}</Text> : null}
          </View>
          <Text style={styles.muted}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function ProfileScreen() {
  const db = useSQLiteContext();
  const { people, person } = usePeople();
  const [saved, setSaved] = useState<Profile | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [backupText, setBackupText] = useState("");
  const [switching, setSwitching] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(getThemeMode);
  const [startMode] = useState<ThemeMode>(getThemeMode);

  // Name and weight can change on other screens, so re-read on every visit.
  useFocusEffect(
    useCallback(() => {
      getProfile(db).then(setSaved);
      getSetting(db, "health").then((raw) => {
        try {
          setHealth(raw ? (JSON.parse(raw) as Health) : null);
        } catch {
          setHealth(null);
        }
      });
    }, [db]),
  );

  const summary = useMemo(() => {
    if (!saved) return null;
    const t = calorieTarget(saved);
    return { t, m: macroTargets(saved, t.kcal), bmr: Math.round(bmr(saved)) };
  }, [saved]);

  const onExport = async () => {
    const backup = await exportBackup(db);
    await Share.share({
      title: "Thali backup",
      message: JSON.stringify(backup),
    });
  };

  const onRestore = async () => {
    try {
      await importBackup(db, backupText.trim());
      await loadCustomFoods(db);
      haptic.success();
      setRestoring(false);
      setBackupText("");
      Alert.alert("Restored", "Your data is back.");
      router.replace("/");
    } catch (e) {
      haptic.warn();
      Alert.alert(
        "Could not restore",
        e instanceof SyntaxError
          ? "That text is not a complete backup. Copy the whole message and try again."
          : e instanceof Error
            ? e.message
            : "Please try again.",
      );
    }
  };

  const onReset = () =>
    Alert.alert(
      `Delete ${saved?.name || "your"} data?`,
      "The profile, food logs, weights, custom foods and edits will be erased from this phone. Export a backup first if you want to keep them.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: async () => {
            await resetAll(db);
            registerCustomFoods([]);
            router.replace("/onboarding");
          },
        },
      ],
    );

  const goalLine = saved
    ? `${GOAL_LABEL[saved.goal]} · ${saved.weightKg}${
        saved.goal === "maintain" ? "" : ` → ${saved.targetWeightKg}`
      } kg`
    : "";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingVertical: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {saved && (
        <View style={[card, styles.meRow]}>
          <Mascot mood="proud" size={64} float={false} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{saved.name || "You"}</Text>
            <Text style={styles.muted}>
              {saved.age} yrs · {saved.heightCm} cm
            </Text>
            <Text style={styles.muted}>{goalLine}</Text>
          </View>
          <Pressable
            style={styles.switch}
            onPress={() => setSwitching(true)}
            accessibilityRole="button"
            accessibilityLabel="Switch person or add someone"
          >
            <Text style={styles.switchText}>
              {people.list.length > 1 ? "Switch" : "Add family"}
            </Text>
          </Pressable>
        </View>
      )}
      {summary && saved && (
        <View style={card}>
          <Text style={styles.title}>{summary.t.kcal} kcal / day</Text>
          <Text style={styles.muted}>
            BMR {summary.bmr} · Maintenance {summary.t.tdee}
            {summary.t.deficit > 0 ? ` · Deficit ${summary.t.deficit}` : ""}
            {summary.t.surplus > 0 ? ` · Surplus ${summary.t.surplus}` : ""}
          </Text>
          <Text style={styles.muted}>
            Protein {summary.m.protein}g · Carbs {summary.m.carbs}g · Fats{" "}
            {summary.m.fat}g · Fiber {summary.m.fiber}g
          </Text>
          {summary.t.clampedToFloor && (
            <Text
              style={[styles.muted, { color: colors.warnText, marginTop: 6 }]}
            >
              Target held at the safe minimum. Weight loss will be slower than
              the pace you picked.
            </Text>
          )}
          {summary.t.gainBlocked && (
            <Text
              style={[styles.muted, { color: colors.warnText, marginTop: 6 }]}
            >
              Your BMI is already high, so calories are held at maintenance
              {saved.goal === "muscle" ? " with extra protein" : ""} instead of
              adding more.
            </Text>
          )}
          {summary.t.atGoal && saved.goal !== "maintain" && (
            <Text
              style={[
                styles.muted,
                { color: colors.primaryText, marginTop: 6 },
              ]}
            >
              🎉 You're at your goal weight. Calories are set to keep it there.
            </Text>
          )}
          {health?.medical && (
            <Text
              style={[styles.muted, { color: colors.warnText, marginTop: 6 }]}
            >
              You mentioned a health condition. Check this plan with your
              doctor.
            </Text>
          )}
        </View>
      )}

      <Menu
        rows={[
          {
            emoji: "🎯",
            label: "Goal and body",
            sub: "Goal, weight, activity, diet, pace",
            onPress: () => router.push("/edit-profile"),
          },
          {
            emoji: "🔔",
            label: "Reminders",
            sub: "Meals, water, evening check-in, weigh-in",
            onPress: () => router.push("/reminders"),
          },
          {
            emoji: "🍛",
            label: "My foods",
            sub: "Your own dishes and favourites",
            onPress: () => router.push("/foods"),
          },
          {
            emoji: "⏱",
            label: "Fasting timer",
            sub: "Start and stop a fast, see your history",
            onPress: () => router.push("/fasting"),
          },
          {
            emoji: "☁️",
            label: "Cloud backup",
            sub: loadSession()
              ? "Keep your data safe if you lose the phone"
              : "Not backed up: your data is only on this phone",
            onPress: () => router.push("/cloud"),
          },
          {
            emoji: "🔢",
            label: "How calories work",
            sub: "Where your numbers come from",
            onPress: () => router.push("/about"),
          },
        ]}
      />

      <View style={card}>
        <Text style={styles.section}>Appearance</Text>
        <View style={styles.modes}>
          {(
            [
              ["system", "Follow phone"],
              ["light", "Light"],
              ["dark", "Dark"],
            ] as [ThemeMode, string][]
          ).map(([m, label]) => (
            <Pressable
              key={m}
              style={[styles.mode, mode === m && styles.modeOn]}
              onPress={() => {
                setThemeMode(m);
                setMode(m);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m }}
            >
              <Text style={[styles.modeText, mode === m && { color: "#fff" }]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {mode !== startMode ? (
          <Text style={[styles.muted, { marginTop: 8 }]}>
            Close and reopen Thali to apply this.
          </Text>
        ) : null}
      </View>

      <Menu
        title={`Data for ${person.name}`}
        rows={[
          { emoji: "📤", label: "Export backup", onPress: onExport },
          {
            emoji: "📥",
            label: "Restore from backup",
            onPress: () => setRestoring(true),
          },
          {
            emoji: "🧭",
            label: "Replay app tour",
            onPress: async () => {
              await setSetting(db, "tour_done", "0");
              router.navigate("/");
            },
          },
          { emoji: "🗑️", label: "Delete all data", onPress: onReset },
        ]}
      />

      <Sheet visible={restoring} onClose={() => setRestoring(false)}>
        <Text style={sheetStyles.title}>Restore from backup</Text>
        <Text style={sheetStyles.sub}>
          Paste the whole backup message. This replaces all data for{" "}
          {person.name} on this phone.
        </Text>
        <TextInput
          style={styles.backupInput}
          multiline
          value={backupText}
          onChangeText={setBackupText}
          placeholder='{"app":"thali", ...}'
          placeholderTextColor={colors.muted}
          accessibilityLabel="Backup text"
        />
        <Pressable
          style={[sheetStyles.save, !backupText.trim() && { opacity: 0.5 }]}
          disabled={!backupText.trim()}
          onPress={onRestore}
          accessibilityRole="button"
        >
          <Text style={sheetStyles.saveText}>Restore</Text>
        </Pressable>
      </Sheet>
      <PeopleSheet visible={switching} onClose={() => setSwitching(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  meRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  section: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 4,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.track,
  },
  menuFirst: { borderTopWidth: 0 },
  menuText: { fontSize: 15, fontWeight: "600", color: colors.text },
  switch: {
    backgroundColor: colors.track,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  switchText: { fontSize: 13, fontWeight: "700", color: colors.text },
  modes: { flexDirection: "row", gap: 8, marginTop: 8 },
  mode: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: colors.track,
  },
  modeOn: { backgroundColor: colors.primary },
  modeText: { fontSize: 13, fontWeight: "700", color: colors.text },
  backupInput: {
    marginTop: 12,
    minHeight: 120,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
    color: colors.text,
    textAlignVertical: "top",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  muted: { fontSize: 13, color: colors.muted },
});
