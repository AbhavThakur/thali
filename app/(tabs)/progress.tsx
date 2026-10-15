import { useSQLiteContext } from "expo-sqlite";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { logWeight, today } from "../../src/db/db.ts";
import { syncReminders } from "../../src/ui/notifications.ts";
import { calorieTarget } from "../../src/domain/energy.ts";
import { ACHIEVEMENTS, goalKg, progressKg } from "../../src/domain/rewards.ts";
import { useProgress } from "../../src/hooks/useProgress.ts";
import { Loading } from "../../src/ui/Loading.tsx";
import { PromptSheet } from "../../src/ui/Sheet.tsx";
import { card, colors } from "../../src/ui/theme.ts";
import { WeightChart } from "../../src/ui/WeightChart.tsx";

const STAR_COLORS = [colors.track, "#BBF7D0", "#4ADE80", "#15803D"];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The last 5 full weeks (Mon–Sun) ending with this week. */
function calendarDays(): string[] {
  const now = new Date();
  const sunday = now.getDate() + (6 - ((now.getDay() + 6) % 7));
  return Array.from({ length: 35 }, (_, i) =>
    ymd(new Date(now.getFullYear(), now.getMonth(), sunday - 34 + i)),
  );
}

export default function ProgressScreen() {
  const db = useSQLiteContext();
  const { data, loaded, reload } = useProgress();
  const { width } = useWindowDimensions();
  const [logging, setLogging] = useState(false);

  if (!loaded) return <Loading label="Loading your progress…" />;
  if (!data) return <Redirect href="/onboarding" />;

  const { profile, stats, weights, days, earned, streak } = data;
  const moved = progressKg(stats);
  const goalSize = goalKg(stats);
  const pct = goalSize > 0 ? Math.max(0, Math.min(1, moved / goalSize)) : 0;
  const t = calorieTarget(profile);
  const toGo = Math.abs(stats.targetKg - stats.currentKg);
  const weeksLeft =
    t.deficit > 0
      ? Math.max(0, Math.ceil((toGo * 7700) / (t.deficit * 7)))
      : t.surplus > 0
        ? Math.max(0, Math.ceil((toGo * 7700) / (t.surplus * 7)))
        : null;
  const steady = profile.goal === "maintain";
  const drift = stats.currentKg - stats.startKg;
  const todayStr = today();
  const cal = calendarDays();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingVertical: 16 }}
    >
      <View style={card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Weight</Text>
          <Pressable
            style={styles.pillBtn}
            onPress={() => setLogging(true)}
            accessibilityRole="button"
            accessibilityLabel="Log weight"
          >
            <Text style={styles.pillBtnText}>+ Log weight</Text>
          </Pressable>
        </View>
        <View style={styles.weightRow}>
          {[
            ["Start", stats.startKg],
            ["Now", stats.currentKg],
            ["Goal", stats.targetKg],
          ].map(([l, v]) => (
            <View key={l as string} style={{ alignItems: "center", flex: 1 }}>
              <Text style={styles.big}>{(+v).toFixed(1)}</Text>
              <Text style={styles.muted}>{l} (kg)</Text>
            </View>
          ))}
        </View>
        {!steady && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct * 100}%` }]} />
          </View>
        )}
        <Text style={[styles.muted, { marginTop: 6 }]}>
          {steady
            ? `Staying steady: ${drift > 0 ? "+" : ""}${drift.toFixed(1)} kg since you started`
            : `${moved > 0 ? `${moved.toFixed(1)} kg ${profile.goal === "lose" ? "lost" : "gained"} · ` : ""}${Math.round(pct * 100)}% of your goal${weeksLeft ? ` · about ${weeksLeft} weeks to go` : ""}`}
        </Text>
        <View style={{ marginTop: 12 }}>
          <WeightChart
            points={weights}
            targetKg={stats.targetKg}
            width={width - 64}
          />
        </View>
      </View>

      <View style={styles.statGrid}>
        {[
          ["🔥", streak, "Current streak"],
          ["🏆", stats.bestStreak, "Best streak"],
          ["📅", stats.loggedDays, "Days logged"],
          ["🎯", stats.onTargetDays, "On-target days"],
        ].map(([e, v, l]) => (
          <View key={l as string} style={styles.stat}>
            <Text style={{ fontSize: 22 }}>{e}</Text>
            <Text style={styles.big}>{v}</Text>
            <Text style={styles.muted}>{l}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[card, styles.historyCard]}
        onPress={() => router.push("/history")}
        accessibilityRole="button"
        accessibilityLabel="Open full history"
      >
        <Text style={{ fontSize: 26 }}>📖</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>History</Text>
          <Text style={styles.muted}>
            Every day you logged: meals, calories, water and weight. Add
            anything you missed.
          </Text>
        </View>
        <Text style={styles.muted}>›</Text>
      </Pressable>

      <View style={card}>
        <Text style={styles.cardTitle}>Last 5 weeks</Text>
        <Text style={[styles.muted, { marginBottom: 10 }]}>
          Darker = more stars that day. Tap a day to see it.
        </Text>
        <View style={styles.calHead}>
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <Text key={i} style={styles.calHeadText}>
              {d}
            </Text>
          ))}
        </View>
        <View style={styles.cal}>
          {cal.map((d) => {
            const s = days.get(d)?.stars.stars ?? 0;
            const future = d > todayStr;
            return (
              <Pressable
                key={d}
                disabled={future}
                onPress={() =>
                  router.push({ pathname: "/history", params: { date: d } })
                }
                accessibilityRole="button"
                accessibilityLabel={`${d}: ${s} stars`}
                style={[
                  styles.calCell,
                  { backgroundColor: future ? "transparent" : STAR_COLORS[s] },
                  d === todayStr && styles.calToday,
                ]}
              >
                <Text
                  style={[
                    styles.calNum,
                    s >= 3
                      ? { color: "#fff" }
                      : s >= 1
                        ? { color: "#0F172A" }
                        : null,
                  ]}
                >
                  {+d.slice(8)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={card}>
        <Text style={styles.cardTitle}>
          Achievements · {earned.length}/{ACHIEVEMENTS.length}
        </Text>
        <View style={styles.badges}>
          {ACHIEVEMENTS.map((a) => {
            const got = earned.some((e) => e.id === a.id);
            return (
              <View
                key={a.id}
                style={[styles.badge, !got && styles.badgeLocked]}
              >
                <Text style={[styles.badgeEmoji, !got && { opacity: 0.25 }]}>
                  {a.emoji}
                </Text>
                <Text style={styles.badgeTitle} numberOfLines={1}>
                  {a.title}
                </Text>
                <Text style={styles.badgeHint} numberOfLines={3}>
                  {got ? "Unlocked" : a.hint}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <PromptSheet
        visible={logging}
        title="Today's weight"
        subtitle="Weigh at the same time each day, ideally after waking up."
        initial={String(stats.currentKg)}
        numeric
        unit="kg"
        validate={(v) =>
          +v >= 30 && +v <= 250 ? null : "Enter a weight between 30 and 250 kg."
        }
        onClose={() => setLogging(false)}
        onSave={async (v) => {
          await logWeight(db, todayStr, Math.round(+v * 10) / 10);
          syncReminders(db);
          setLogging(false);
          reload();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { fontSize: 12, color: colors.muted },
  cardTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  historyCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pillBtn: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  weightRow: { flexDirection: "row", marginTop: 14 },
  big: { fontSize: 22, fontWeight: "800", color: colors.text },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.track,
    marginTop: 14,
    overflow: "hidden",
  },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  stat: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    alignItems: "flex-start",
  },
  calHead: { flexDirection: "row", justifyContent: "space-between" },
  calHeadText: {
    width: "13%",
    textAlign: "center",
    fontSize: 12,
    color: colors.muted,
    fontWeight: "700",
  },
  cal: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 6,
    marginTop: 6,
  },
  calCell: {
    width: "13%",
    aspectRatio: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  calToday: { borderWidth: 2, borderColor: colors.text },
  calNum: { fontSize: 12, color: colors.text, fontWeight: "600" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  badge: {
    width: "31%",
    backgroundColor: colors.tint,
    borderRadius: 14,
    padding: 10,
    alignItems: "center",
  },
  badgeLocked: { backgroundColor: colors.bg },
  badgeEmoji: { fontSize: 28 },
  badgeTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
    marginTop: 4,
  },
  badgeHint: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: 2,
  },
});
