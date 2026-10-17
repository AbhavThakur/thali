import { Redirect, router, useFocusEffect } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addLogs,
  deleteBatch,
  deleteLog,
  getSetting,
  logWeight,
  saveProfile,
  setSetting,
  setWater,
} from "../../src/db/db.ts";
import {
  formatDuration,
  parseFasting,
  type FastState,
  fastProgress,
} from "../../src/domain/fasting.ts";
import { FOOD_BY_ID } from "../../src/domain/foods.ts";
import { repeatOffer } from "../../src/domain/repeat.ts";
import {
  lastWeighIn,
  parseWeight,
  weighInText,
} from "../../src/domain/weighIn.ts";
import {
  describeServing,
  formatQty,
  macrosFor,
} from "../../src/domain/nutrition.ts";
import {
  applyOverrides,
  buildDayPlan,
  dayNumber,
  SLOTS,
} from "../../src/domain/plan.ts";
import { dayStars, type Achievement } from "../../src/domain/rewards.ts";
import { reviewDay } from "../../src/domain/dayReview.ts";
import type { SlotId } from "../../src/domain/types.ts";
import { useProgress, WATER_GOAL } from "../../src/hooks/useProgress.ts";
import { useBackupNudge } from "../../src/hooks/useBackupNudge.ts";
import { useToday } from "../../src/hooks/useToday.ts";
import { CalorieRing } from "../../src/ui/CalorieRing.tsx";
import { Celebration } from "../../src/ui/Celebration.tsx";
import { haptic } from "../../src/ui/haptics.ts";
import { MacroBars } from "../../src/ui/MacroBars.tsx";
import { Mascot, type Mood } from "../../src/ui/Mascot.tsx";
import { Loading } from "../../src/ui/Loading.tsx";
import { PeopleSheet, usePeople } from "../../src/ui/People.tsx";
import { MealHelp } from "../../src/ui/MealHelp.tsx";
import { PromptSheet } from "../../src/ui/Sheet.tsx";
import { card, colors, isDark } from "../../src/ui/theme.ts";
import { useToast } from "../../src/ui/Toast.tsx";
import { Tour, type TourStep } from "../../src/ui/Tour.tsx";
import {
  loadReminderPrefs,
  saveReminderPrefs,
  syncReminders,
} from "../../src/ui/notifications.ts";
import { turnOnReminders } from "../../src/ui/ReminderSettings.tsx";

const SLOT_EMOJI: Record<SlotId, string> = {
  early_morning: "🌅",
  breakfast: "🥣",
  lunch: "🍛",
  snack: "🍎",
  dinner: "🍲",
  bedtime: "🌙",
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function cheer(
  consumed: number,
  target: number,
  logged: boolean,
): [string, Mood] {
  if (!logged)
    return new Date().getHours() >= 21
      ? ["Nothing logged today. Add what you ate before bed 🌙", "sleepy"]
      : ["Your plan is ready. Log your first meal 🌞", "happy"];
  const r = consumed / target;
  if (r > 1.1)
    return ["A little over today. Tomorrow's a fresh thali 🌱", "thinking"];
  if (r >= 0.9) return ["Right on target. Great job! 🎯", "cheer"];
  return [
    `${Math.round(target - consumed)} kcal to go. You're doing great 💪`,
    "proud",
  ];
}

export default function TodayScreen() {
  const {
    db,
    date,
    profile,
    logs,
    yesterday,
    targets,
    consumed,
    streak,
    overrides,
    water,
    loaded,
    reload,
  } = useToday();
  const progress = useProgress();
  const backup = useBackupNudge(streak);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [editName, setEditName] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { people, person, rename } = usePeople();
  const [celebrate, setCelebrate] = useState<Achievement | null>(null);
  const [touring, setTouring] = useState(false);
  const [askReminders, setAskReminders] = useState(false);
  const [weighing, setWeighing] = useState(false);
  const [helpSlot, setHelpSlot] = useState<SlotId | null>(null);
  const [fast, setFast] = useState<FastState | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const headerRef = useRef<View>(null);
  const summaryRef = useRef<View>(null);
  const starsRef = useRef<View>(null);
  const waterRef = useRef<View>(null);
  const mealRef = useRef<View>(null);

  // Shown once after onboarding; Me → "Replay app tour" clears the flag.
  // The green header needs light status-bar icons; other tabs go back to dark.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle(isDark ? "light" : "dark");
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      getSetting(db, "fasting").then((raw) => setFast(parseFasting(raw)));
      getSetting(db, "tour_done").then((v) => {
        if (v !== "1") setTimeout(() => setTouring(true), 600);
      });
      Promise.all([
        loadReminderPrefs(db),
        getSetting(db, "reminder_prompt"),
      ]).then(([prefs, seen]) =>
        // Browsers can't schedule reminders, so don't offer them there.
        setAskReminders(
          Platform.OS !== "web" && !prefs.enabled && seen !== "done",
        ),
      );
    }, [db]),
  );

  const answerReminders = async (yes: boolean) => {
    setAskReminders(false);
    await setSetting(db, "reminder_prompt", "done");
    if (!yes || !(await turnOnReminders())) return;
    await saveReminderPrefs(db, {
      ...(await loadReminderPrefs(db)),
      enabled: true,
    });
    await syncReminders(db);
    haptic.success();
    toast("Reminders on 🔔 Change times in Me");
  };

  const endTour = () => {
    setTouring(false);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setSetting(db, "tour_done", "1");
  };

  const tourSteps = useMemo<TourStep[]>(
    () => [
      {
        title: "Welcome to Thali! 👋",
        body: "Tap your name to change it. The 🔥 counts the days in a row you log food, and 🔔 sets meal and water reminders.",
        target: headerRef,
      },
      {
        title: "Your day at a glance",
        body: "The ring shows calories left today. The bars show protein, carbs, fats and fiber.",
        target: summaryRef,
      },
      {
        title: "Earn 3 stars a day",
        body: "Log every meal, land within 10% of your calories, and hit your protein. Eating less never earns stars.",
        target: starsRef,
      },
      {
        title: "Drink up 💧",
        body: "Tap a glass each time you drink water. Aim for 8 a day.",
        target: waterRef,
      },
      {
        title: "Log a meal in one tap",
        body: "Each meal shows a suggestion from your plan. Tap “I ate this” to log it, or Undo if it was a mistake. Use “+ Add food” for anything else.",
        target: mealRef,
      },
      {
        title: "Your diet plan",
        body: "See the whole week, switch between 3 options, edit any meal and get your grocery list.",
        tab: 1,
      },
      {
        title: "Track progress",
        body: "Log your weight, see your trend, streaks and badges, and open your full History.",
        tab: 2,
      },
      {
        title: "Your family",
        body: "Join with an invite code to cheer each other on. Only daily effort is shared, never rankings.",
        tab: 3,
      },
      {
        title: "All about you",
        body: "Update your details, back up your data, or replay this tour any time.",
        tab: 4,
      },
    ],
    [],
  );

  const plan = useMemo(
    () =>
      profile && targets
        ? applyOverrides(
            buildDayPlan(
              targets.kcal,
              profile.dietType,
              dayNumber(date),
              1,
              true,
            ),
            overrides,
          )
        : [],
    [profile, targets, date, overrides],
  );

  const earned = progress.data?.earned;
  useEffect(() => {
    if (!earned) return;
    (async () => {
      const seen: string[] = JSON.parse(
        (await getSetting(db, "seen_achievements")) ?? "[]",
      );
      const fresh = earned.filter((a) => !seen.includes(a.id));
      if (!fresh.length) return;
      await setSetting(
        db,
        "seen_achievements",
        JSON.stringify(earned.map((a) => a.id)),
      );
      haptic.success();
      setCelebrate(fresh[0]);
    })();
  }, [earned, db]);

  if (!loaded) return <Loading />;
  if (!profile || !targets) return <Redirect href="/onboarding" />;

  const refresh = () => {
    reload();
    progress.reload();
  };

  const remove = (id: number, name: string) =>
    Alert.alert("Remove item?", name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => deleteLog(db, id).then(refresh),
      },
    ]);

  const logSuggestion = async (
    slotId: SlotId,
    label: string,
    items: { foodId: string; qty: number }[],
  ) => {
    const batch = `${Date.now()}-${slotId}`;
    await addLogs(
      db,
      date,
      items.map((it) => ({ slot: slotId, ...it })),
      batch,
    );
    haptic.success();
    refresh();
    toast(`${label} logged`, {
      label: "Undo",
      onPress: () => deleteBatch(db, batch).then(refresh),
    });
  };

  const changeWater = async (glasses: number) => {
    haptic.tap();
    await setWater(db, date, glasses);
    refresh();
  };

  // "Same again": adds earlier entries to today as one batch, so a single Undo removes them all.
  const repeat = async (
    label: string,
    entries: { slot: SlotId; foodId: string; qty: number }[],
  ) => {
    const batch = `${Date.now()}-repeat`;
    await addLogs(db, date, entries, batch);
    haptic.success();
    refresh();
    toast(`${label} added`, {
      label: "Undo",
      onPress: () => deleteBatch(db, batch).then(refresh),
    });
  };

  const stars = dayStars(consumed, targets, [
    ...new Set(logs.map((l) => l.slot)),
  ]);
  const [message, mood] = cheer(consumed.kcal, targets.kcal, logs.length > 0);
  const dayAgain = repeatOffer(yesterday);
  const review = reviewDay({
    eaten: consumed,
    target: targets,
    slotsLogged: [...new Set(logs.map((l) => l.slot))],
    water,
    waterGoal: WATER_GOAL,
    goal: profile.goal,
    diet: profile.dietType,
    hour: new Date().getHours(),
  });

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 24 }}
      onScroll={(e) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={32}
    >
      <LinearGradient
        colors={[colors.primary, "#0B845C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <View ref={headerRef} collapsable={false} style={styles.headerInner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.date}>
              {new Date(`${date}T00:00`).toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </Text>
            <Pressable
              onPress={() => setEditName(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit your name"
            >
              <Text style={styles.hello}>
                {greeting()}
                {profile.name ? `, ${profile.name}` : ""} ✎
              </Text>
            </Pressable>
          </View>
          <View
            style={styles.streak}
            accessibilityLabel={`${streak} day streak`}
          >
            <Text style={styles.streakText}>🔥 {streak}</Text>
            <Text style={styles.streakSub}>
              {streak === 1 ? "day" : "days"}
            </Text>
          </View>
          <Pressable
            style={styles.bell}
            onPress={() => router.push("/reminders")}
            accessibilityRole="button"
            accessibilityLabel="Reminders"
            hitSlop={8}
          >
            <Text style={styles.bellText}>🔔</Text>
          </Pressable>
          {people.list.length > 1 && (
            <Pressable
              style={styles.bell}
              onPress={() => setSwitching(true)}
              accessibilityRole="button"
              accessibilityLabel="Switch person"
              hitSlop={8}
            >
              <Text style={styles.bellText}>👥</Text>
            </Pressable>
          )}
        </View>
      </LinearGradient>

      <View style={[card, styles.hero]}>
        <View ref={summaryRef} collapsable={false} style={styles.summary}>
          <CalorieRing consumed={consumed.kcal} target={targets.kcal} />
          <MacroBars consumed={consumed} target={targets} />
        </View>
        <View ref={starsRef} collapsable={false} style={styles.starsRow}>
          {[
            [stars.allMeals, "All meals"],
            [stars.onTarget, "On target"],
            [stars.protein, "Protein"],
          ].map(([ok, label]) => (
            <View key={label as string} style={styles.starItem}>
              <Text style={[styles.star, !ok && styles.starOff]}>⭐</Text>
              <Text style={styles.starLabel}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.cheer}>
          <Mascot mood={mood} size={56} />
          <Text style={styles.cheerText}>{message}</Text>
        </View>
      </View>

      {review && !touring && (
        <View style={[card, styles.ask]}>
          <Text style={styles.slotTitle}>🌙 {review.headline}</Text>
          <Text style={styles.muted}>{review.tip}</Text>
        </View>
      )}

      {backup.nudge && !askReminders && !touring && (
        <View style={[card, styles.ask]}>
          <Text style={styles.slotTitle}>☁️ {backup.nudge.title}</Text>
          <Text style={styles.muted}>{backup.nudge.body}</Text>
          <View style={styles.askRow}>
            <Pressable
              style={styles.logBtn}
              onPress={() => router.push("/cloud")}
              accessibilityRole="button"
            >
              <Text style={styles.logBtnText}>Back up now</Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={backup.later}
              accessibilityRole="button"
            >
              <Text style={styles.add}>Not now</Text>
            </Pressable>
          </View>
        </View>
      )}

      {askReminders && !touring && (
        <View style={[card, styles.ask]}>
          <Text style={styles.slotTitle}>🔔 Want gentle reminders?</Text>
          <Text style={styles.muted}>
            We'll nudge you at meal times and to drink water, and skip anything
            you've already logged.
          </Text>
          <View style={styles.askRow}>
            <Pressable
              style={styles.logBtn}
              onPress={() => answerReminders(true)}
              accessibilityRole="button"
            >
              <Text style={styles.logBtnText}>Turn on</Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => answerReminders(false)}
              accessibilityRole="button"
            >
              <Text style={styles.add}>Not now</Text>
            </Pressable>
          </View>
        </View>
      )}

      {logs.length === 0 && dayAgain && !askReminders && !touring && (
        <View style={[card, styles.ask]}>
          <Text style={styles.slotTitle}>↺ Same as yesterday?</Text>
          <Text style={styles.muted}>
            Copy all of yesterday's meals ({Math.round(dayAgain.kcal)} kcal).
            You can still change anything.
          </Text>
          <View style={styles.askRow}>
            <Pressable
              style={styles.logBtn}
              onPress={() => repeat("Yesterday's meals", dayAgain.entries)}
              accessibilityRole="button"
            >
              <Text style={styles.logBtnText}>Copy yesterday</Text>
            </Pressable>
          </View>
        </View>
      )}

      {fast?.active && (
        <Pressable
          style={[card, styles.ask]}
          onPress={() => router.push("/fasting")}
          accessibilityRole="button"
          accessibilityLabel="Open fasting timer"
        >
          <Text style={styles.slotTitle}>⏱ Fasting</Text>
          <Text style={styles.muted}>
            {fastProgress(fast.active, Date.now()).done
              ? `Goal of ${fast.active.goalHours} h reached. You can eat when you're ready.`
              : `${formatDuration(fastProgress(fast.active, Date.now()).elapsed)} so far, goal ${fast.active.goalHours} h.`}{" "}
            Tap to open.
          </Text>
        </Pressable>
      )}

      <View ref={waterRef} collapsable={false} style={card}>
        <View style={styles.slotHeader}>
          <Text style={styles.slotEmoji}>💧</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.slotTitle}>Water</Text>
            <Text style={styles.muted}>
              {water} of {WATER_GOAL} glasses
            </Text>
          </View>
          {water > 0 && (
            <Pressable
              hitSlop={8}
              onPress={() => changeWater(water - 1)}
              accessibilityLabel="Remove a glass"
            >
              <Text style={styles.add}>−</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.glasses}>
          {Array.from({ length: WATER_GOAL }, (_, i) => (
            <Pressable
              key={i}
              hitSlop={6}
              onPress={() => changeWater(i < water ? i : i + 1)}
              accessibilityLabel={`Glass ${i + 1}`}
              style={[styles.glass, i < water && styles.glassFull]}
            >
              <Text style={{ fontSize: 16 }}>{i < water ? "💧" : ""}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={card}>
        <View style={styles.slotHeader}>
          <Text style={styles.slotEmoji}>⚖️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.slotTitle}>Weigh-in</Text>
            <Text style={styles.muted}>
              {weighInText(lastWeighIn(progress.data?.weights ?? [], date))}
            </Text>
          </View>
          <Pressable
            style={styles.logBtn}
            onPress={() => setWeighing(true)}
            accessibilityRole="button"
            accessibilityLabel="Log your weight"
          >
            <Text style={styles.logBtnText}>Log</Text>
          </Pressable>
        </View>
      </View>

      {SLOTS.map((slot) => {
        const rows = logs.filter(
          (l) => l.slot === slot.id && FOOD_BY_ID[l.food_id],
        );
        const kcal = rows.reduce(
          (s, l) => s + macrosFor(FOOD_BY_ID[l.food_id], l.qty).kcal,
          0,
        );
        const slotPlan = plan.find((p) => p.slot === slot.id);
        const suggestion = slotPlan?.options[0];
        const slotTarget = slotPlan?.targetKcal ?? 0;
        const batch = rows.find((l) => l.batch_id)?.batch_id;
        const again =
          rows.length === 0 ? repeatOffer(yesterday, slot.id) : null;
        const pct = slotTarget ? Math.min(kcal / slotTarget, 1) : 0;
        return (
          <View
            key={slot.id}
            ref={slot.id === "breakfast" ? mealRef : undefined}
            collapsable={false}
            style={card}
          >
            <View style={styles.slotHeader}>
              <Text style={styles.slotEmoji}>{SLOT_EMOJI[slot.id]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.slotTitle}>{slot.label}</Text>
                <Text style={styles.muted}>
                  {Math.round(kcal)} / {slotTarget} kcal
                </Text>
              </View>
              {rows.length > 0 && <Text style={styles.done}>✓</Text>}
              <Pressable
                hitSlop={8}
                onPress={() => setHelpSlot(slot.id)}
                style={styles.info}
                accessibilityRole="button"
                accessibilityLabel={`How ${slot.label} calories are worked out`}
              >
                <Text style={styles.infoText}>ⓘ</Text>
              </Pressable>
            </View>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
            </View>

            {rows.map((l) => {
              const food = FOOD_BY_ID[l.food_id];
              return (
                <View key={l.id} style={styles.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{food.name}</Text>
                    <Text style={styles.muted}>
                      {describeServing(food, l.qty)} ·{" "}
                      {Math.round(macrosFor(food, l.qty).kcal)} kcal · P{" "}
                      {Math.round(macrosFor(food, l.qty).protein)} g
                    </Text>
                  </View>
                  <Pressable
                    hitSlop={10}
                    onPress={() => remove(l.id, food.name)}
                  >
                    <Text style={styles.x}>✕</Text>
                  </Pressable>
                </View>
              );
            })}

            {rows.length === 0 && suggestion && (
              <View style={styles.suggest}>
                <Text style={styles.suggestLabel}>Suggested</Text>
                <Text style={styles.itemName}>
                  {suggestion.items
                    .map(
                      (it) => `${it.food.name} (${formatQty(it.food, it.qty)})`,
                    )
                    .join(" + ")}
                </Text>
                <Text style={styles.muted}>
                  {Math.round(suggestion.totals.kcal)} kcal
                </Text>
              </View>
            )}

            {again && (
              <Pressable
                hitSlop={6}
                style={styles.again}
                onPress={() => repeat(slot.label, again.entries)}
                accessibilityRole="button"
                accessibilityLabel={`Repeat yesterday's ${slot.label}`}
              >
                <Text style={styles.add}>
                  ↺ Repeat yesterday's {slot.label.toLowerCase()} ·{" "}
                  {Math.round(again.kcal)} kcal
                </Text>
              </Pressable>
            )}

            <View style={styles.actions}>
              {rows.length === 0 && suggestion ? (
                <Pressable
                  style={styles.logBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`I ate the suggested ${slot.label}`}
                  onPress={() =>
                    logSuggestion(
                      slot.id,
                      slot.label,
                      suggestion.items.map((it) => ({
                        foodId: it.food.id,
                        qty: it.qty,
                      })),
                    )
                  }
                >
                  <Text style={styles.logBtnText}>✓ I ate this</Text>
                </Pressable>
              ) : batch ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => deleteBatch(db, batch).then(refresh)}
                >
                  <Text style={styles.add}>Undo</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable
                hitSlop={8}
                onPress={() =>
                  router.push({ pathname: "/add", params: { slot: slot.id } })
                }
                accessibilityRole="button"
                accessibilityLabel={`Add food to ${slot.label}`}
              >
                <Text style={styles.add}>+ Add food</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <PromptSheet
        visible={editName}
        title="What should we call you?"
        initial={profile.name}
        validate={(v) =>
          v.trim().length > 40 ? "Keep it under 40 letters." : null
        }
        onClose={() => setEditName(false)}
        onSave={async (name) => {
          await saveProfile(db, { ...profile, name });
          rename(person.id, name);
          setEditName(false);
          refresh();
        }}
      />
      <PromptSheet
        visible={weighing}
        title="Your weight today"
        subtitle="Weigh at the same time each day, ideally after waking up."
        initial={String(
          lastWeighIn(progress.data?.weights ?? [], date)?.kg ??
            profile.weightKg,
        )}
        numeric
        unit="kg"
        validate={(v) =>
          parseWeight(v) ? null : "Enter a weight between 30 and 250 kg."
        }
        onClose={() => setWeighing(false)}
        onSave={async (v) => {
          await logWeight(db, date, parseWeight(v) as number);
          syncReminders(db);
          setWeighing(false);
          haptic.success();
          refresh();
        }}
      />
      <PeopleSheet visible={switching} onClose={() => setSwitching(false)} />
      <MealHelp
        visible={helpSlot !== null}
        profile={profile}
        slot={helpSlot ?? "breakfast"}
        onClose={() => setHelpSlot(null)}
      />
      <Celebration achievement={celebrate} onClose={() => setCelebrate(null)} />
      <Tour
        steps={tourSteps}
        visible={touring && !celebrate}
        scrollBy={(dy) =>
          scrollRef.current?.scrollTo({
            y: Math.max(0, scrollY.current + dy),
            animated: true,
          })
        }
        onDone={endTour}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  hero: { marginTop: -36 },
  ask: { gap: 6, borderWidth: 1.5, borderColor: "#A7F3D0" },
  askRow: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 6 },
  headerInner: { flex: 1, flexDirection: "row", alignItems: "center" },
  date: { fontSize: 13, color: "#FFFFFF", fontWeight: "600" },
  hello: { fontSize: 24, fontWeight: "800", color: "#fff", marginTop: 2 },
  streak: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  streakText: { fontSize: 18, fontWeight: "800", color: "#fff" },
  streakSub: { fontSize: 12, color: "#FFFFFF", fontWeight: "600" },
  bell: {
    marginLeft: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  bellText: { fontSize: 20 },
  starsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 14,
  },
  starItem: { alignItems: "center" },
  star: { fontSize: 22 },
  starOff: { opacity: 0.2 },
  starLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
    marginTop: 2,
  },
  glasses: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  glass: {
    width: 32,
    height: 40,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  glassFull: { backgroundColor: "#DBEAFE", borderColor: "#60A5FA" },
  muted: { fontSize: 13, color: colors.muted },
  summary: { flexDirection: "row", alignItems: "center", gap: 16 },
  cheer: {
    marginTop: 14,
    backgroundColor: colors.tint,
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cheerText: {
    color: colors.tintText,
    fontWeight: "600",
    fontSize: 14,
    flex: 1,
  },
  slotHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  slotEmoji: { fontSize: 28 },
  slotTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  done: { fontSize: 18, color: colors.primaryText, fontWeight: "800" },
  info: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  infoText: { fontSize: 22, color: colors.muted },
  bar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.track,
    marginTop: 10,
    marginBottom: 4,
    overflow: "hidden",
  },
  barFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.track,
  },
  itemName: { fontSize: 14, color: colors.text, fontWeight: "500" },
  x: { fontSize: 14, color: colors.muted, paddingHorizontal: 4 },
  suggest: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 2,
  },
  suggestLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primaryText,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  logBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  logBtnText: { color: "#fff", fontWeight: "700" },
  add: { color: colors.primaryText, fontWeight: "700" },
  again: { marginTop: 8 },
});
