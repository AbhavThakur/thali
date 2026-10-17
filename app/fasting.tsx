import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getProfile, getSetting, setSetting } from "../src/db/db.ts";
import {
  emptyFasting,
  endFast,
  FAST_GOALS,
  fastHours,
  fastingAccess,
  fastProgress,
  fastStats,
  formatDuration,
  parseFasting,
  reachedGoal,
  startFast,
  type FastingAccess,
  type FastState,
} from "../src/domain/fasting.ts";
import type { Health } from "../src/domain/types.ts";
import { haptic } from "../src/ui/haptics.ts";
import { card, colors } from "../src/ui/theme.ts";

export default function Fasting() {
  const db = useSQLiteContext();
  const [state, setState] = useState<FastState>(emptyFasting);
  const [access, setAccess] = useState<FastingAccess | null>(null);
  const [goal, setGoal] = useState(16);
  const [now, setNow] = useState(Date.now());

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setState(parseFasting(await getSetting(db, "fasting")));
        const [profile, rawHealth] = await Promise.all([
          getProfile(db),
          getSetting(db, "health"),
        ]);
        let health: Health | null = null;
        try {
          health = rawHealth ? (JSON.parse(rawHealth) as Health) : null;
        } catch {
          health = null;
        }
        setAccess(fastingAccess(health, profile?.age ?? 30));
      })();
    }, [db]),
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const save = async (next: FastState) => {
    setState(next);
    setNow(Date.now());
    await setSetting(db, "fasting", JSON.stringify(next));
  };

  const start = async () => {
    haptic.success();
    await save(startFast(state, Date.now(), goal));
  };

  const end = () =>
    Alert.alert("End this fast?", "Your fast is saved to your history.", [
      { text: "Keep fasting", style: "cancel" },
      {
        text: "End fast",
        onPress: async () => {
          haptic.tap();
          await save(endFast(state, Date.now()));
        },
      },
    ]);

  if (!access) return <View style={styles.screen} />;

  if (!access.ok)
    return (
      <ScrollView style={styles.screen}>
        <View style={card}>
          <Text style={styles.title}>Fasting isn't a fit right now</Text>
          <Text style={[styles.muted, { marginTop: 6 }]}>{access.reason}</Text>
        </View>
      </ScrollView>
    );

  const active = state.active;
  const p = active ? fastProgress(active, now) : null;
  const stats = fastStats(state.history, now);
  const recent = [...state.history].reverse().slice(0, 10);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 }}
    >
      {access.caution ? (
        <View style={card}>
          <Text style={[styles.muted, { color: colors.warnText }]}>
            {access.caution}
          </Text>
        </View>
      ) : null}

      <View style={[card, styles.center]}>
        {active && p ? (
          <>
            <Text style={styles.label}>You've been fasting for</Text>
            <Text style={styles.big} accessibilityLiveRegion="polite">
              {formatDuration(p.elapsed)}
            </Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${p.ratio * 100}%` }]} />
            </View>
            <Text style={styles.muted}>
              {p.done
                ? `Goal of ${active.goalHours} h reached 🎉 You can eat when you're ready.`
                : `Goal ${active.goalHours} h · ${formatDuration(p.remaining)} to go`}
            </Text>
            {p.tooLong ? (
              <Text
                style={[styles.muted, { color: colors.warnText, marginTop: 8 }]}
              >
                That's over a day. Please have something to eat and end this
                fast.
              </Text>
            ) : null}
            <Pressable
              style={styles.endBtn}
              onPress={end}
              accessibilityRole="button"
            >
              <Text style={styles.endText}>End fast</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.label}>Start a fast, aiming for</Text>
            <View style={styles.chips}>
              {FAST_GOALS.map((h) => (
                <Pressable
                  key={h}
                  onPress={() => setGoal(h)}
                  style={[styles.chip, goal === h && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: goal === h }}
                  accessibilityLabel={`${h} hours`}
                >
                  <Text
                    style={[styles.chipText, goal === h && { color: "#fff" }]}
                  >
                    {h} h
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.startBtn}
              onPress={start}
              accessibilityRole="button"
            >
              <Text style={styles.startText}>Start fast now</Text>
            </Pressable>
            <Text style={[styles.muted, { marginTop: 8 }]}>
              The timer starts the moment you tap. Forgot to start? End it and
              begin again; nothing is lost.
            </Text>
          </>
        )}
      </View>

      <View style={card}>
        <Text style={styles.title}>Last 7 days</Text>
        {stats.count ? (
          <Text style={[styles.muted, { marginTop: 4 }]}>
            {stats.count} {stats.count === 1 ? "fast" : "fasts"}, goal reached{" "}
            {stats.reached} {stats.reached === 1 ? "time" : "times"}, average{" "}
            {stats.avgHours.toFixed(1)} h. Longest ever{" "}
            {stats.longestHours.toFixed(1)} h.
          </Text>
        ) : (
          <Text style={[styles.muted, { marginTop: 4 }]}>
            No fasts yet this week.
          </Text>
        )}
        {recent.map((f) => (
          <View key={f.start} style={styles.row}>
            <Text style={styles.name}>
              {new Date(f.start).toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </Text>
            <Text style={styles.muted}>
              {fastHours(f).toFixed(1)} h · goal {f.goalHours} h{" "}
              {reachedGoal(f) ? "✓" : ""}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[styles.muted, styles.note]}>
        Fasting isn't for everyone. Stop and eat if you feel dizzy, weak or
        unwell, and drink water through the fast. Thali never gives stars for
        eating less.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center" },
  title: { fontSize: 17, fontWeight: "800", color: colors.text },
  label: { fontSize: 14, fontWeight: "600", color: colors.muted },
  big: {
    fontSize: 48,
    fontWeight: "800",
    color: colors.text,
    marginVertical: 6,
  },
  muted: { fontSize: 13, color: colors.muted },
  bar: {
    alignSelf: "stretch",
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.track,
    marginVertical: 10,
    overflow: "hidden",
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginVertical: 12,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: colors.track,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: "700", color: colors.text },
  startBtn: {
    alignSelf: "stretch",
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: "center",
  },
  startText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  endBtn: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 22,
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
  endText: { color: colors.danger, fontWeight: "800", fontSize: 15 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.track,
    marginTop: 4,
  },
  name: { fontSize: 14, fontWeight: "600", color: colors.text },
  note: { marginHorizontal: 20, marginTop: 4 },
});
