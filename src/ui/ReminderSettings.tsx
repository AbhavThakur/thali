import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState, type ReactNode } from "react";
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import {
  fmtTime,
  shiftTime,
  type MealReminder,
  type ReminderPrefs,
} from "../domain/reminders.ts";
import { haptic } from "./haptics.ts";
import {
  ensurePermission,
  loadReminderPrefs,
  saveReminderPrefs,
  sendTestReminder,
  syncReminders,
} from "./notifications.ts";
import { card, colors } from "./theme.ts";
import { useToast } from "./Toast.tsx";

const MEALS: [MealReminder, string][] = [
  ["breakfast", "🥣 Breakfast"],
  ["lunch", "🍛 Lunch"],
  ["snack", "🍎 Snack"],
  ["dinner", "🍲 Dinner"],
];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const FULL_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const WATER_EVERY = [1, 1.5, 2, 3];

/** Asks for permission; if the user blocked it earlier, offers the system settings. */
export async function turnOnReminders(): Promise<boolean> {
  if (await ensurePermission()) return true;
  Alert.alert(
    "Notifications are off",
    "Allow notifications for Expo Go / Thali in your phone settings to get reminders.",
    [
      { text: "Not now", style: "cancel" },
      { text: "Open settings", onPress: () => Linking.openSettings() },
    ],
  );
  return false;
}

function TimeStepper({
  value,
  onChange,
  step = 15,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  step?: number;
  label: string;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        hitSlop={8}
        style={styles.stepBtn}
        onPress={() => onChange(shiftTime(value, -step))}
        accessibilityLabel={`${label} earlier`}
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.time}>{fmtTime(value)}</Text>
      <Pressable
        hitSlop={8}
        style={styles.stepBtn}
        onPress={() => onChange(shiftTime(value, step))}
        accessibilityLabel={`${label} later`}
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.track }}
        thumbColor="#fff"
        accessibilityLabel={label}
      />
    </View>
  );
}

export function ReminderSettings() {
  const db = useSQLiteContext();
  const toast = useToast();
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadReminderPrefs(db).then(setPrefs);
    }, [db]),
  );

  if (!prefs) return null;

  const update = async (next: ReminderPrefs) => {
    setPrefs(next);
    await saveReminderPrefs(db, next);
    syncReminders(db);
  };
  const set = <K extends keyof ReminderPrefs>(k: K, v: ReminderPrefs[K]) =>
    update({ ...prefs, [k]: v });

  const toggleAll = async (on: boolean) => {
    if (on && !(await turnOnReminders())) return;
    haptic.tap();
    await update({ ...prefs, enabled: on });
    if (on) toast("Reminders on 🔔");
  };

  return (
    <View style={card}>
      <Toggle label="🔔 Reminders" value={prefs.enabled} onChange={toggleAll} />
      <Text style={styles.muted}>
        Gentle nudges to log meals and drink water. Already done? Thali skips
        that reminder.
      </Text>

      {prefs.enabled && (
        <>
          <View style={styles.section}>
            <Toggle
              label="Meal reminders"
              value={prefs.meals}
              onChange={(v) => set("meals", v)}
            />
            {prefs.meals &&
              MEALS.map(([k, label]) => (
                <Row key={k} label={label}>
                  <TimeStepper
                    label={label}
                    value={prefs.mealTimes[k]}
                    onChange={(v) =>
                      set("mealTimes", { ...prefs.mealTimes, [k]: v })
                    }
                  />
                </Row>
              ))}
          </View>

          <View style={styles.section}>
            <Toggle
              label="💧 Water reminders"
              value={prefs.water}
              onChange={(v) => set("water", v)}
            />
            {prefs.water && (
              <>
                <Row label="Every">
                  <View style={styles.chips}>
                    {WATER_EVERY.map((h) => (
                      <Pressable
                        key={h}
                        onPress={() => set("waterEveryHours", h)}
                        style={[
                          styles.chip,
                          prefs.waterEveryHours === h && styles.chipOn,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            prefs.waterEveryHours === h && { color: "#fff" },
                          ]}
                        >
                          {h}h
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </Row>
                <Row label="From">
                  <TimeStepper
                    label="Water from"
                    step={30}
                    value={prefs.waterFrom}
                    onChange={(v) => set("waterFrom", v)}
                  />
                </Row>
                <Row label="Until">
                  <TimeStepper
                    label="Water until"
                    step={30}
                    value={prefs.waterTo}
                    onChange={(v) => set("waterTo", v)}
                  />
                </Row>
              </>
            )}
          </View>

          <View style={styles.section}>
            <Toggle
              label="🔥 Evening check-in"
              value={prefs.evening}
              onChange={(v) => set("evening", v)}
            />
            {prefs.evening && (
              <Row label="At">
                <TimeStepper
                  label="Evening check-in"
                  value={prefs.eveningTime}
                  onChange={(v) => set("eveningTime", v)}
                />
              </Row>
            )}
          </View>

          <View style={styles.section}>
            <Toggle
              label="⚖️ Weekly weigh-in"
              value={prefs.weighIn}
              onChange={(v) => set("weighIn", v)}
            />
            {prefs.weighIn && (
              <>
                <View style={[styles.chips, { marginTop: 8 }]}>
                  {DAYS.map((d, i) => (
                    <Pressable
                      key={i}
                      onPress={() => set("weighInDay", i)}
                      style={[
                        styles.day,
                        prefs.weighInDay === i && styles.chipOn,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: prefs.weighInDay === i }}
                      accessibilityLabel={`Weigh in on ${FULL_DAYS[i]}`}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          prefs.weighInDay === i && { color: "#fff" },
                        ]}
                      >
                        {d}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Row label="At">
                  <TimeStepper
                    label="Weigh-in"
                    value={prefs.weighInTime}
                    onChange={(v) => set("weighInTime", v)}
                  />
                </Row>
              </>
            )}
          </View>

          <Pressable
            style={styles.test}
            onPress={async () => {
              try {
                await sendTestReminder();
                toast("Test reminder in 5 seconds");
              } catch {
                toast("Could not schedule a test reminder");
              }
            }}
            accessibilityRole="button"
          >
            <Text style={styles.testText}>Send a test reminder</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 13, color: colors.muted, marginTop: 4 },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.track,
    marginTop: 12,
    paddingTop: 8,
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  rowLabel: { fontSize: 14, color: colors.text },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.track,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 17, fontWeight: "700", color: colors.text },
  time: {
    minWidth: 72,
    textAlign: "center",
    fontWeight: "700",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  chips: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.track,
  },
  day: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.track,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.text },
  test: {
    marginTop: 16,
    alignSelf: "flex-start",
    backgroundColor: colors.tint,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  testText: { color: colors.tintText, fontWeight: "700" },
});
