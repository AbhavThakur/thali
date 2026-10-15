import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { CloudError } from "../../src/domain/cloud.ts";
import {
  familyStreakWeeks,
  familyWeek,
  formatInviteCode,
  isInviteCode,
  KUDOS_EMOJI,
  KUDOS_MAX_LENGTH,
  latestWeight,
  MEMBER_EMOJI,
  timeAgo,
  todayStatus,
  WEEK_GOAL_DAYS,
  nameOf,
  type FamilyMember,
} from "../../src/domain/family.ts";
import { today } from "../../src/db/db.ts";
import { cloudConfig, loadSession } from "../../src/ui/cloudSync.ts";
import {
  clearCheerCache,
  createFamily,
  joinFamily,
  leaveFamily,
  loadFamily,
  loadFamilyMe,
  markCheersSeen,
  newInviteCode,
  publishFamily,
  sendCheer,
  updateFamilyMe,
  type FamilySnapshot,
} from "../../src/ui/familySync.ts";
import { haptic } from "../../src/ui/haptics.ts";
import { usePeople } from "../../src/ui/People.tsx";
import { PromptSheet, Sheet, sheetStyles } from "../../src/ui/Sheet.tsx";
import { card, colors } from "../../src/ui/theme.ts";
import { useToast } from "../../src/ui/Toast.tsx";

type State =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "signin" }
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "ready"; snap: FamilySnapshot; newKudos: Set<number> };

const message = (e: unknown) =>
  e instanceof CloudError
    ? e.message
    : "Something went wrong. Please try again.";

const PHRASES = ["Keep going!", "Proud of you!", "Great job today!"];

export default function FamilyScreen() {
  const { people } = usePeople();
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myName, setMyName] = useState(
    () => people.list.find((p) => p.id === people.active)?.name ?? "",
  );
  const [myEmoji, setMyEmoji] = useState(MEMBER_EMOJI[0]);
  const [familyName, setFamilyName] = useState("");
  const [code, setCode] = useState("");

  const [cheerTo, setCheerTo] = useState<FamilyMember | null>(null);
  const [cheerEmoji, setCheerEmoji] = useState<string>(KUDOS_EMOJI[0]);
  const [cheerText, setCheerText] = useState("");
  const [renaming, setRenaming] = useState(false);

  const reload = useCallback(async () => {
    try {
      if (!cloudConfig()) return setState({ kind: "off" });
      if (!loadSession()) return setState({ kind: "signin" });
      await publishFamily(people, true);
      const snap = await loadFamily();
      if (!snap) return setState({ kind: "none" });
      const newKudos = new Set(
        snap.kudos.filter((k) => !k.seen).map((k) => k.id),
      );
      setState({ kind: "ready", snap, newKudos });
      if (newKudos.size) markCheersSeen().catch(() => {});
    } catch (e) {
      setState({ kind: "error", message: message(e) });
    }
  }, [people]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // One busy flag and one place for errors, like the cloud screen.
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      haptic.warn();
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      await createFamily(people, familyName, myName, myEmoji);
      haptic.success();
      await reload();
    });

  const join = () =>
    run(async () => {
      await joinFamily(people, code, myName, myEmoji);
      haptic.success();
      setCode("");
      await reload();
    });

  const sendCheerNow = () =>
    run(async () => {
      if (!cheerTo) return;
      await sendCheer(cheerTo.userId, cheerEmoji, cheerText);
      haptic.success();
      toast(`Sent to ${cheerTo.name}`);
      setCheerTo(null);
      setCheerText("");
    });

  const week = useMemo(
    () =>
      state.kind === "ready"
        ? familyWeek(state.snap.family.members, state.snap.days, today())
        : null,
    [state],
  );
  const streakWeeks = useMemo(
    () =>
      state.kind === "ready"
        ? familyStreakWeeks(state.snap.family.members, state.snap.days, today())
        : 0,
    [state],
  );

  if (state.kind === "loading")
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );

  if (state.kind === "off" || state.kind === "signin")
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
        <View style={card}>
          <Text style={styles.title}>Cheer each other on</Text>
          <Text style={styles.body}>
            {state.kind === "off"
              ? "Family needs cloud backup, which isn't set up in this build. See README.md."
              : "Everyone installs Thali on their own phone and joins one family with an invite code. You see each other's streaks and send cheers. Nobody sees what anyone eats."}
          </Text>
          {state.kind === "signin" && (
            <Pressable
              style={styles.primary}
              onPress={() => router.push("/cloud")}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>Sign in to the cloud first</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    );

  if (state.kind === "error")
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
        <View style={card}>
          <Text style={styles.title}>Couldn't load your family</Text>
          <Text style={styles.body}>{state.message}</Text>
          <Pressable
            style={styles.primary}
            onPress={() => {
              setState({ kind: "loading" });
              reload();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Try again</Text>
          </Pressable>
        </View>
      </ScrollView>
    );

  if (state.kind === "none")
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.pad}
        keyboardShouldPersistTaps="handled"
      >
        <View style={card}>
          <Text style={styles.title}>About you</Text>
          <Text style={styles.body}>
            This is how your family sees you. Only your streak, stars and
            meals-logged are shared, never what you ate.
          </Text>
          <TextInput
            style={styles.input}
            value={myName}
            onChangeText={setMyName}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            maxLength={30}
            accessibilityLabel="Your name"
          />
          <EmojiRow
            value={myEmoji}
            options={MEMBER_EMOJI}
            onPick={setMyEmoji}
          />
        </View>

        <View style={card}>
          <Text style={styles.title}>Start a family</Text>
          <TextInput
            style={styles.input}
            value={familyName}
            onChangeText={setFamilyName}
            placeholder="Family name, e.g. Sharma family"
            placeholderTextColor={colors.muted}
            maxLength={40}
            accessibilityLabel="Family name"
          />
          <Pressable
            style={[styles.primary, busy && styles.disabled]}
            disabled={busy || !familyName.trim() || !myName.trim()}
            onPress={create}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Create family</Text>
          </Pressable>
        </View>

        <View style={card}>
          <Text style={styles.title}>Join with an invite code</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="ABCD-2345"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            accessibilityLabel="Invite code"
          />
          <Pressable
            style={[styles.primary, busy && styles.disabled]}
            disabled={busy || !isInviteCode(code) || !myName.trim()}
            onPress={join}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Join family</Text>
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
      </ScrollView>
    );

  const { snap, newKudos } = state;
  const { family } = snap;
  const meMember = family.members.find((m) => m.userId === family.me);
  const myPrefs = loadFamilyMe();
  const members = [
    ...family.members.filter((m) => m.userId === family.me),
    ...family.members.filter((m) => m.userId !== family.me),
  ];
  const day = today();

  const invite = async () => {
    try {
      await Share.share({
        message: `Join my family on Thali. Open Family, tap "Join with an invite code" and enter ${formatInviteCode(family.inviteCode)}.`,
      });
    } catch {
      // Sharing was cancelled.
    }
  };

  const remake = () =>
    Alert.alert(
      "Make a new invite code?",
      "The old code stops working. People who already joined stay in the family.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Make new code",
          onPress: () =>
            run(async () => {
              await newInviteCode();
              haptic.success();
              await reload();
            }),
        },
      ],
    );

  const leave = () =>
    Alert.alert(
      "Leave this family?",
      "You stop sharing and your shared days and cheers are deleted. Your data on this phone is not touched.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () =>
            run(async () => {
              await leaveFamily();
              clearCheerCache();
              setState({ kind: "none" });
            }),
        },
      ],
    );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.pad}
      keyboardShouldPersistTaps="handled"
    >
      <View style={card}>
        <Text style={styles.title}>{family.name}</Text>
        <Text style={styles.body}>
          Invite code{" "}
          <Text style={styles.code} selectable>
            {formatInviteCode(family.inviteCode)}
          </Text>
        </Text>
        <Pressable
          style={styles.secondary}
          onPress={invite}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>Invite someone</Text>
        </Pressable>
      </View>

      {week && (
        <View style={card}>
          <Text style={styles.title}>
            This week{streakWeeks > 0 ? `  🔥 ${streakWeeks}` : ""}
          </Text>
          <Text style={styles.body}>
            {week.allDone
              ? "Everyone reached the goal. Well done, family! 🎉"
              : `Goal: everyone logs ${WEEK_GOAL_DAYS} days. ${week.daysLeft} ${week.daysLeft === 1 ? "day" : "days"} left.`}
          </Text>
          {streakWeeks > 0 && (
            <Text style={styles.sub}>
              {streakWeeks} {streakWeeks === 1 ? "week" : "weeks"} in a row with
              everyone on track.
            </Text>
          )}
          {week.members.map((w) => {
            const m = family.members.find((x) => x.userId === w.userId);
            return (
              <View key={w.userId} style={styles.weekRow}>
                <Text style={styles.weekName} numberOfLines={1}>
                  {m?.emoji} {m?.name}
                </Text>
                <View style={styles.dots}>
                  {Array.from({ length: w.required }, (_, i) => (
                    <View
                      key={i}
                      style={[styles.dot, i < w.logged && styles.dotOn]}
                    />
                  ))}
                </View>
                <Text style={styles.weekCount}>
                  {Math.min(w.logged, w.required)}/{w.required}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {members.map((m) => {
        const days = snap.days.get(m.userId);
        const todays = days?.find((d) => d.day === day);
        const status = todayStatus(todays);
        const weight = m.shareWeight ? latestWeight(days) : null;
        const isMe = m.userId === family.me;
        return (
          <View key={m.userId} style={card}>
            <View style={styles.row}>
              <Text style={styles.avatar}>{m.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {m.name}
                  {isMe ? " (you)" : ""}
                </Text>
                <Text style={styles.sub}>
                  {m.streak > 0
                    ? `🔥 ${m.streak} ${m.streak === 1 ? "day" : "days"} in a row`
                    : "No streak yet"}
                </Text>
              </View>
              {!isMe && (
                <Pressable
                  style={styles.cheerBtn}
                  onPress={() => {
                    setCheerEmoji(KUDOS_EMOJI[0]);
                    setCheerText("");
                    setError(null);
                    setCheerTo(m);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Cheer ${m.name}`}
                >
                  <Text style={styles.cheerBtnText}>Cheer 👏</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.today}>
              {status === "done"
                ? "✅ Logged all meals today"
                : status === "partial"
                  ? `🍽️ ${todays?.meals} of 3 meals logged today`
                  : "Nothing logged yet today"}
              {todays && todays.stars > 0 ? `   ⭐ ${todays.stars}` : ""}
              {todays?.waterOk ? "   💧" : ""}
              {weight != null ? `   ⚖️ ${weight} kg` : ""}
            </Text>
          </View>
        );
      })}

      <View style={card}>
        <Text style={styles.title}>Cheers for you</Text>
        {snap.kudos.length === 0 ? (
          <Text style={styles.body}>
            No cheers yet. They show up here when someone in the family sends
            one.
          </Text>
        ) : (
          snap.kudos.slice(0, 10).map((k) => (
            <View
              key={k.id}
              style={[styles.kudos, newKudos.has(k.id) && styles.kudosNew]}
            >
              <Text style={styles.kudosEmoji}>{k.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.kudosText}>
                  {nameOf(family.members, k.fromUser)}
                  {k.message ? `: ${k.message}` : " cheered you on"}
                </Text>
                <Text style={styles.sub}>
                  {timeAgo(k.createdAt, Date.now())}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={card}>
        <Text style={styles.title}>Your sharing</Text>
        <Text style={styles.body}>
          Shared: streak, stars, meals logged and water. Never what you ate or
          your calories.
        </Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>Share my weight</Text>
            <Text style={styles.sub}>
              Off by default. Turn it off any time and it is removed.
            </Text>
          </View>
          <Switch
            value={!!myPrefs?.shareWeight}
            disabled={busy}
            onValueChange={(on) =>
              run(async () => {
                await updateFamilyMe(people, { shareWeight: on });
                await reload();
              })
            }
            trackColor={{ true: colors.primary, false: colors.track }}
            accessibilityLabel="Share my weight"
          />
        </View>
        {people.list.length > 1 && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.name}>Sharing as</Text>
            <View style={styles.chips}>
              {people.list.map((p) => {
                const on = (myPrefs?.profileKey ?? people.list[0].id) === p.id;
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.chip, on && styles.chipOn]}
                    disabled={busy}
                    onPress={() =>
                      run(async () => {
                        await updateFamilyMe(people, { profileKey: p.id });
                        await reload();
                      })
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        <Pressable
          style={styles.link}
          onPress={() => setRenaming(true)}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>
            Change my family name ({meMember?.name})
          </Text>
        </Pressable>
        <EmojiRow
          value={meMember?.emoji ?? MEMBER_EMOJI[0]}
          options={MEMBER_EMOJI}
          onPick={(e) =>
            run(async () => {
              await updateFamilyMe(people, { emoji: e });
              await reload();
            })
          }
        />
        <Pressable
          style={styles.link}
          onPress={remake}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>Make a new invite code</Text>
        </Pressable>
        <Pressable
          style={styles.link}
          onPress={leave}
          accessibilityRole="button"
        >
          <Text style={[styles.linkText, { color: colors.danger }]}>
            Leave this family
          </Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
      </View>

      <Sheet visible={!!cheerTo} onClose={() => setCheerTo(null)}>
        <Text style={sheetStyles.title}>Cheer {cheerTo?.name}</Text>
        <EmojiRow
          value={cheerEmoji}
          options={[...KUDOS_EMOJI]}
          onPick={setCheerEmoji}
          big
        />
        <TextInput
          style={styles.input}
          value={cheerText}
          onChangeText={setCheerText}
          placeholder="Add a few words (optional)"
          placeholderTextColor={colors.muted}
          maxLength={KUDOS_MAX_LENGTH}
          accessibilityLabel="Message"
        />
        <View style={styles.chips}>
          {PHRASES.map((p) => (
            <Pressable
              key={p}
              style={styles.chip}
              onPress={() => setCheerText(p)}
              accessibilityRole="button"
            >
              <Text style={styles.chipText}>{p}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[sheetStyles.save, busy && styles.disabled]}
          disabled={busy}
          onPress={sendCheerNow}
          accessibilityRole="button"
        >
          <Text style={sheetStyles.saveText}>Send cheer</Text>
        </Pressable>
      </Sheet>

      <PromptSheet
        visible={renaming}
        title="Your name in the family"
        initial={meMember?.name ?? ""}
        validate={(v) => (v.trim() ? null : "Enter a name")}
        onClose={() => setRenaming(false)}
        onSave={async (v) => {
          setRenaming(false);
          await run(async () => {
            await updateFamilyMe(people, { name: v });
            await reload();
          });
        }}
      />
    </ScrollView>
  );
}

function EmojiRow({
  value,
  options,
  onPick,
  big,
}: {
  value: string;
  options: string[];
  onPick: (e: string) => void;
  big?: boolean;
}) {
  return (
    <View style={styles.chips}>
      {options.map((e) => (
        <Pressable
          key={e}
          style={[styles.emoji, e === value && styles.emojiOn]}
          onPress={() => onPick(e)}
          accessibilityRole="button"
          accessibilityLabel={e}
          accessibilityState={{ selected: e === value }}
        >
          <Text style={{ fontSize: big ? 28 : 22 }}>{e}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingVertical: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  body: { fontSize: 14, color: colors.muted, marginTop: 6, lineHeight: 20 },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  code: { fontWeight: "800", color: colors.primaryText, letterSpacing: 1 },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 8,
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  primary: {
    marginTop: 14,
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondary: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: colors.tint,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryText: { color: colors.tintText, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { fontSize: 32 },
  name: { fontSize: 16, fontWeight: "700", color: colors.text },
  today: { marginTop: 10, fontSize: 14, color: colors.text },
  cheerBtn: {
    backgroundColor: colors.tint,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: "center",
  },
  cheerBtnText: { color: colors.tintText, fontWeight: "700" },
  weekRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  weekName: { flex: 1, fontSize: 14, color: colors.text },
  dots: { flexDirection: "row", gap: 4, marginRight: 8 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.track,
  },
  dotOn: { backgroundColor: colors.primary },
  weekCount: {
    width: 32,
    textAlign: "right",
    fontSize: 13,
    color: colors.muted,
  },
  kudos: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginTop: 6,
  },
  kudosNew: { backgroundColor: colors.tint },
  kudosEmoji: { fontSize: 24 },
  kudosText: { fontSize: 14, color: colors.text },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 12,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: {
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  emoji: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.track,
  },
  emojiOn: { borderColor: colors.primary, backgroundColor: colors.tint },
  link: { marginTop: 14, minHeight: 40, justifyContent: "center" },
  linkText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
});
