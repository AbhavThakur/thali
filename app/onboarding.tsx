import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { logWeight, saveProfile, setSetting, today } from "../src/db/db.ts";
import {
  calorieTarget,
  GOALS,
  macroTargets,
  minHealthyWeightKg,
} from "../src/domain/energy.ts";
import type {
  ActivityLevel,
  DietType,
  Goal,
  Health,
  Sex,
} from "../src/domain/types.ts";
import {
  goalAdvice,
  targetOptions,
  weightGuide,
  type BmiCategory,
} from "../src/domain/bmi.ts";
import {
  ageError,
  EMPTY,
  schedule,
  toProfile,
  type Form,
} from "../src/ui/profileForm.ts";
import { formatDay } from "../src/domain/timeline.ts";
import { cmToFtIn, ftInToCm } from "../src/domain/units.ts";
import { TargetDate } from "../src/ui/TargetDate.tsx";
import { colors } from "../src/ui/theme.ts";
import { haptic } from "../src/ui/haptics.ts";
import { Mascot } from "../src/ui/Mascot.tsx";
import { usePeople } from "../src/ui/People.tsx";

const ACTIVITY_CARDS: [ActivityLevel, string, string, string][] = [
  ["sedentary", "🪑", "Mostly sitting", "Desk job, little walking"],
  ["light", "🚶", "Lightly active", "Some walking, light chores"],
  ["moderate", "🧹", "On my feet", "Housework, exercise 3–5 days"],
  ["active", "🏃", "Active", "Hard exercise most days"],
  ["very_active", "🏋️", "Very active", "Physical job or daily training"],
];
const DIET_CARDS: [DietType, string, string][] = [
  ["vegetarian", "🥬", "Vegetarian"],
  ["eggetarian", "🥚", "Eggetarian"],
  ["non_vegetarian", "🍗", "Non-vegetarian"],
  ["vegan", "🌱", "Vegan"],
  ["jain", "🙏", "Jain"],
];
const SEX_CARDS: [Sex, string, string][] = [
  ["female", "👩", "Female"],
  ["male", "👨", "Male"],
];

// Logical step ids; the order they appear in depends on the goal (see `stepOrder`).
const S = {
  welcome: 0,
  name: 1,
  about: 2,
  body: 3,
  activity: 4,
  diet: 5,
  when: 6,
  health: 7,
  plan: 8,
  goal: 9,
} as const;

/** "Stay healthy" (or a goal with nothing to schedule) has no target date, so that question is skipped. */
const stepOrder = (dated: boolean): number[] => [
  S.welcome,
  S.name,
  S.about,
  S.goal,
  S.body,
  S.activity,
  S.diet,
  ...(dated ? [S.when] : []),
  S.health,
  S.plan,
];

const BAND_COLOR: Record<BmiCategory, string> = {
  underweight: "#2563EB",
  healthy: "#15803D",
  overweight: "#B45309",
  obese: "#DC2626",
};
const BAND_LABEL: Record<BmiCategory, string> = {
  underweight: "Underweight",
  healthy: "Healthy",
  overweight: "Overweight",
  obese: "Obese",
};
// Widths follow the BMI scale from 15 to 35.
const BANDS: [BmiCategory, number][] = [
  ["underweight", 3.5],
  ["healthy", 4.5],
  ["overweight", 2],
  ["obese", 10],
];

function Option({
  emoji,
  title,
  sub,
  active,
  onPress,
  role = "radio",
}: {
  emoji: string;
  title: string;
  sub?: string;
  active: boolean;
  onPress: () => void;
  role?: "radio" | "checkbox";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, active && styles.optionActive]}
      accessibilityRole={role}
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      accessibilityState={{ checked: active, selected: active }}
    >
      <Text style={styles.optionEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        {sub ? <Text style={styles.muted}>{sub}</Text> : null}
      </View>
      <View
        style={[
          styles.radio,
          role === "checkbox" && { borderRadius: 6 },
          active && styles.radioActive,
        ]}
      />
    </Pressable>
  );
}

function Input({
  label,
  value,
  onChange,
  unit,
  numeric = true,
  autoFocus,
  inputRef,
  onSubmit,
  returnKeyType = "next",
  onFocusAt,
  hideLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  numeric?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<TextInput | null>;
  /** Called from the keyboard's next/done key. */
  onSubmit?: () => void;
  returnKeyType?: "next" | "done";
  /** Called with this field's top (inside the scrolling content) when it gains focus. */
  onFocusAt?: (y: number) => void;
  /** The label still names the field for screen readers; something else shows it. */
  hideLabel?: boolean;
}) {
  const y = useRef(0);
  return (
    <View
      style={{ marginBottom: 16 }}
      onLayout={(e) => (y.current = e.nativeEvent.layout.y)}
    >
      {hideLabel ? null : <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrap}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChange}
          keyboardType={numeric ? "decimal-pad" : "default"}
          autoFocus={autoFocus}
          returnKeyType={returnKeyType}
          submitBehavior={returnKeyType === "done" ? "blurAndSubmit" : "submit"}
          onSubmitEditing={onSubmit}
          onFocus={() => onFocusAt?.(y.current)}
          placeholderTextColor={colors.muted}
          accessibilityLabel={unit ? `${label} in ${unit}` : label}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/** Height in centimetres, or feet and inches for people who think in those; the form always keeps centimetres. */
function HeightInput({
  value,
  onChange,
  onSubmit,
  onFocusAt,
}: {
  value: string;
  onChange: (cm: string) => void;
  onSubmit: () => void;
  onFocusAt: (y: number) => void;
}) {
  const [unit, setUnit] = useState<"cm" | "ft">("cm");
  const [ft, setFt] = useState("");
  const [inch, setInch] = useState("");
  const inchRef = useRef<TextInput>(null);

  const choose = (u: "cm" | "ft") => {
    if (u === "ft") {
      const cm = +value;
      const f = cm > 0 ? cmToFtIn(cm) : null;
      setFt(f ? String(f.ft) : "");
      setInch(f ? String(f.inch) : "");
    }
    setUnit(u);
  };
  const edit = (f: string, i: string) => {
    setFt(f);
    setInch(i);
    onChange(f.trim() === "" ? "" : String(ftInToCm(+f || 0, +i || 0)));
  };

  return (
    <View>
      <View style={styles.unitRow}>
        <Text style={styles.label}>Height</Text>
        {(["cm", "ft"] as const).map((u) => (
          <Pressable
            key={u}
            onPress={() => choose(u)}
            style={[styles.unitChip, unit === u && styles.unitChipOn]}
            accessibilityRole="radio"
            accessibilityState={{ checked: unit === u }}
            accessibilityLabel={u === "cm" ? "Centimetres" : "Feet and inches"}
          >
            <Text
              style={[styles.unitChipText, unit === u && { color: "#fff" }]}
            >
              {u === "cm" ? "cm" : "ft & in"}
            </Text>
          </Pressable>
        ))}
      </View>
      {unit === "cm" ? (
        <Input
          label="Height"
          hideLabel
          value={value}
          onChange={onChange}
          unit="cm"
          onSubmit={onSubmit}
          onFocusAt={onFocusAt}
        />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Feet"
                hideLabel
                value={ft}
                onChange={(v) => edit(v, inch)}
                unit="ft"
                onSubmit={() => inchRef.current?.focus()}
                onFocusAt={onFocusAt}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Inches"
                hideLabel
                value={inch}
                onChange={(v) => edit(ft, v)}
                unit="in"
                inputRef={inchRef}
                onSubmit={onSubmit}
                onFocusAt={onFocusAt}
              />
            </View>
          </View>
          {+value > 0 ? <Text style={styles.cmHint}>= {value} cm</Text> : null}
        </>
      )}
    </View>
  );
}

/** True while the on-screen keyboard is open, so the bottom safe-area gap can make room for it. */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(
      ios ? "keyboardWillShow" : "keyboardDidShow",
      () => setOpen(true),
    );
    const hide = Keyboard.addListener(
      ios ? "keyboardWillHide" : "keyboardDidHide",
      () => setOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

export default function Onboarding() {
  const db = useSQLiteContext();
  const { people, person, rename, remove } = usePeople();
  const [pos, setPos] = useState(0);
  const [form, setForm] = useState<Form>(() => ({
    ...EMPTY,
    // A person added from the family list already has a name; a first install still says "Me".
    name: people.list.length > 1 ? person.name : "",
  }));
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<Health>({
    pregnant: false,
    ed: false,
    medical: false,
    none: false,
  });
  const [calm, setCalm] = useState(false);
  const keyboardOpen = useKeyboardOpen();
  const scrollRef = useRef<ScrollView>(null);
  const weightRef = useRef<TextInput>(null);
  const targetRef = useRef<TextInput>(null);
  // Waits for the keyboard to finish opening, then keeps the field it covers in view.
  const focusAt = (y: number) => {
    setTimeout(
      () =>
        scrollRef.current?.scrollTo({
          y: Math.max(0, y + 24 - 80),
          animated: true,
        }),
      250,
    );
  };
  // Weeks the person chose on the date step; null means the recommended date.
  const [userWeeks, setUserWeeks] = useState<number | null>(null);
  // The date is only a suggestion; skipping it keeps the same pace without a target date.
  const [useDate, setUseDate] = useState(true);
  const sched = schedule(form, userWeeks, today(), useDate);
  const goal = form.goal;
  // Until the body step is filled in we can't tell, so a weight goal is assumed to have a date step.
  const dated = goal !== "maintain" && !(sched.base && !sched.timeline);
  const order = stepOrder(dated);
  const step = order[pos];
  const last = pos === order.length - 1;
  // Pregnancy or breastfeeding needs a doctor for any plan. An eating-disorder history rules out a deficit.
  const blocked = health.pregnant || (health.ed && goal === "lose");
  const anim = useRef(new Animated.Value(1)).current;
  const set =
    <K extends keyof Form>(k: K) =>
    (v: Form[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setCalm);
  }, []);

  // Android Back steps through the questions; on the first screen it leaves the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (pos === 0) return false;
      if (!saving) setPos((s) => s - 1);
      return true;
    });
    return () => sub.remove();
  }, [pos, saving]);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: calm ? 0 : 280,
      useNativeDriver: true,
    }).start();
  }, [step, anim, calm]);

  const profile = toProfile(sched.form);
  const valid = typeof profile !== "string" ? profile : null;
  const target = valid ? calorieTarget(valid) : null;

  const [shownKcal, setShownKcal] = useState(0);
  const count = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (step !== S.plan || !target) return;
    count.setValue(0);
    const id = count.addListener(({ value }) =>
      setShownKcal(Math.round(value)),
    );
    Animated.timing(count, {
      toValue: target.kcal,
      duration: calm ? 0 : 900,
      useNativeDriver: false,
    }).start();
    return () => count.removeListener(id);
  }, [step, target?.kcal, count, calm]);

  const next = () => {
    const error =
      step === S.about
        ? ageError(form.age)
        : step === S.body && typeof profile === "string"
          ? profile
          : null;
    if (step === S.health && blocked) {
      haptic.warn();
      return;
    }
    if (error) {
      haptic.warn();
      return Alert.alert("Check your details", error);
    }
    haptic.tap();
    Keyboard.dismiss();
    if (step === S.body) setUserWeeks(null);
    setPos((p) => Math.min(p + 1, order.length - 1));
  };

  const finish = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await saveProfile(db, valid);
      await logWeight(db, today(), valid.weightKg);
      await setSetting(db, "health", JSON.stringify(health));
      if (valid.name) rename(person.id, valid.name);
      haptic.success();
      router.replace("/");
    } catch {
      setSaving(false);
      Alert.alert("Could not save", "Please try again.");
    }
  };

  // Picking a goal suggests a sensible target, so "gain" doesn't start from a lower weight.
  const pickGoal = (g: Goal) => {
    const hh = +form.heightCm;
    const ww = +form.weightKg;
    const first =
      hh >= 120 && hh <= 220 && ww >= 30 && ww <= 250
        ? targetOptions(g, hh, ww)[0]
        : undefined;
    setUserWeeks(null);
    setForm((f) => ({
      ...f,
      goal: g,
      targetWeightKg:
        g === "maintain" ? f.weightKg : first ? String(first.kg) : "",
    }));
  };

  const minKg = +form.heightCm >= 120 ? minHealthyWeightKg(+form.heightCm) : 0;
  const h = +form.heightCm;
  const w = +form.weightKg;
  const sized = h >= 120 && h <= 220 && w >= 30 && w <= 250;
  const guide = sized ? weightGuide(h, w) : null;
  const options = sized ? targetOptions(goal, h, w) : [];
  const advice = sized ? goalAdvice(goal, h, w) : null;
  const weeks =
    valid && target && target.deficit > 0
      ? Math.ceil(
          ((valid.weightKg - valid.targetWeightKg) * 7700) /
            (target.deficit * 7),
        )
      : valid && target && target.surplus > 0
        ? Math.ceil(
            ((valid.targetWeightKg - valid.weightKg) * 7700) /
              (target.surplus * 7),
          )
        : null;

  const body = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.center}>
            <Mascot mood="happy" size={140} />
            <Text style={styles.brand}>Thali</Text>
            <Text style={[styles.sub, { textAlign: "center" }]}>
              Reach your health goal with the food you grew up with.
            </Text>
            <View style={{ marginTop: 32, gap: 14, alignSelf: "stretch" }}>
              {[
                ["🥘", "Plans from Indian home dishes"],
                ["🥄", "Roti, katori, glass. No weighing scales."],
                ["🔥", "Streaks to keep you going"],
              ].map(([e, t]) => (
                <View key={t} style={styles.feature}>
                  <Text style={styles.featureEmoji}>{e}</Text>
                  <Text style={styles.featureText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      case 1:
        return (
          <>
            <Text style={styles.q}>What should we call you?</Text>
            <Input
              label="Name"
              value={form.name}
              onChange={set("name")}
              numeric={false}
              autoFocus
              returnKeyType="done"
              onSubmit={next}
            />
          </>
        );
      case 2:
        return (
          <>
            <Text style={styles.q}>A little about you</Text>
            <Text style={[styles.sub, { marginBottom: 16 }]}>
              This sets your calorie needs.
            </Text>
            {SEX_CARDS.map(([v, e, t]) => (
              <Option
                key={v}
                emoji={e}
                title={t}
                active={form.sex === v}
                onPress={() => set("sex")(v)}
              />
            ))}
            <View style={{ height: 8 }} />
            <Input
              label="Age"
              value={form.age}
              onChange={set("age")}
              unit="years"
              returnKeyType="done"
              onSubmit={next}
              onFocusAt={focusAt}
            />
          </>
        );
      case S.goal:
        return (
          <>
            <Text style={styles.q}>What's your goal?</Text>
            <Text style={[styles.sub, { marginBottom: 16 }]}>
              Thali sets your calories and protein around it. You can change
              this later.
            </Text>
            {GOALS.map((g) => (
              <Option
                key={g.id}
                emoji={g.emoji}
                title={g.title}
                sub={g.sub}
                active={form.goal === g.id}
                onPress={() => pickGoal(g.id)}
              />
            ))}
          </>
        );
      case 3:
        return (
          <>
            <Text style={styles.q}>
              {goal === "maintain" ? "Your body" : "Your body and goal"}
            </Text>
            <HeightInput
              value={form.heightCm}
              onChange={set("heightCm")}
              onSubmit={() => weightRef.current?.focus()}
              onFocusAt={focusAt}
            />
            <Input
              label="Current weight"
              value={form.weightKg}
              onChange={set("weightKg")}
              unit="kg"
              inputRef={weightRef}
              returnKeyType={goal === "maintain" ? "done" : "next"}
              onSubmit={
                goal === "maintain" ? next : () => targetRef.current?.focus()
              }
              onFocusAt={focusAt}
            />
            {guide && (
              <View style={styles.guide}>
                <View style={styles.guideHead}>
                  <Text style={styles.guideBmi}>
                    BMI {guide.bmi.toFixed(1)}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: BAND_COLOR[guide.category] },
                    ]}
                  >
                    <Text style={styles.badgeText}>
                      {BAND_LABEL[guide.category]}
                    </Text>
                  </View>
                </View>
                <View style={styles.band}>
                  {BANDS.map(([c, flex]) => (
                    <View
                      key={c}
                      style={{ flex, backgroundColor: BAND_COLOR[c] }}
                    />
                  ))}
                  <View
                    style={[
                      styles.marker,
                      {
                        left: `${Math.max(0, Math.min(1, (guide.bmi - 15) / 20)) * 100}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.guideText}>{guide.message}</Text>
                <Text style={styles.guideRange}>
                  Healthy weight for {h} cm: {guide.healthyMinKg}–
                  {guide.healthyMaxKg} kg
                </Text>
                <Text style={styles.guideNote}>
                  Uses Asian BMI ranges (healthy is 18.5–22.9), which suit
                  Indian bodies better.
                </Text>
              </View>
            )}
            {advice ? (
              <View style={[styles.tip, styles.care]}>
                <Text style={styles.careText}>{advice}</Text>
              </View>
            ) : null}
            {goal !== "maintain" && options.length > 0 && (
              <>
                <Text style={styles.label}>Pick a target</Text>
                {options.map((o) => (
                  <Option
                    key={o.kg}
                    emoji={
                      o.label === "Healthy weight"
                        ? "🎯"
                        : o.label === "Steady goal"
                          ? "🏃"
                          : "🌱"
                    }
                    title={`${o.kg} kg · ${o.label}`}
                    sub={o.note}
                    active={+form.targetWeightKg === o.kg}
                    onPress={() => set("targetWeightKg")(String(o.kg))}
                  />
                ))}
              </>
            )}
            {goal !== "maintain" && (
              <Input
                label={
                  options.length ? "Or enter your own target" : "Target weight"
                }
                value={form.targetWeightKg}
                onChange={set("targetWeightKg")}
                unit="kg"
                inputRef={targetRef}
                returnKeyType="done"
                onSubmit={next}
                onFocusAt={focusAt}
              />
            )}
            {goal === "lose" && minKg > 0 && (
              <View style={styles.tip}>
                <Text style={styles.tipText}>
                  💡 A healthy target for your height is {minKg} kg or more.
                </Text>
              </View>
            )}
          </>
        );
      case 4:
        return (
          <>
            <Text style={styles.q}>How active is your day?</Text>
            {ACTIVITY_CARDS.map(([v, e, t, s]) => (
              <Option
                key={v}
                emoji={e}
                title={t}
                sub={s}
                active={form.activity === v}
                onPress={() => set("activity")(v)}
              />
            ))}
          </>
        );
      case 5:
        return (
          <>
            <Text style={styles.q}>What do you eat?</Text>
            {DIET_CARDS.map(([v, e, t]) => (
              <Option
                key={v}
                emoji={e}
                title={t}
                active={form.dietType === v}
                onPress={() => set("dietType")(v)}
              />
            ))}
          </>
        );
      case S.when:
        return sched.base && sched.timeline && sched.plan ? (
          <>
            <Text style={styles.q}>Here's a date to aim for</Text>
            <Text style={[styles.sub, { marginBottom: 16 }]}>
              Worked out from your height, weight and goal. A date is optional:
              use it, change it, or skip it.
            </Text>
            <TargetDate
              base={sched.base}
              timeline={sched.timeline}
              plan={sched.plan}
              from={today()}
              onWeeks={setUserWeeks}
              dated={useDate}
              onDated={setUseDate}
            />
          </>
        ) : null;
      case S.health:
        return (
          <>
            <Text style={styles.q}>A quick health check</Text>
            <Text style={[styles.sub, { marginBottom: 16 }]}>
              Diet plans aren't right for everyone. Tick anything that applies,
              or choose "None of these".
            </Text>
            <Option
              role="checkbox"
              emoji="🤰"
              title="Pregnant or breastfeeding"
              active={health.pregnant}
              onPress={() =>
                setHealth((h) => ({ ...h, pregnant: !h.pregnant, none: false }))
              }
            />
            <Option
              role="checkbox"
              emoji="💚"
              title="I've had an eating disorder"
              active={health.ed}
              onPress={() =>
                setHealth((h) => ({ ...h, ed: !h.ed, none: false }))
              }
            />
            <Option
              role="checkbox"
              emoji="🩺"
              title="Diabetes, thyroid, PCOS, kidney or heart condition, or I take regular medicines"
              active={health.medical}
              onPress={() =>
                setHealth((h) => ({ ...h, medical: !h.medical, none: false }))
              }
            />
            <Option
              role="checkbox"
              emoji="✅"
              title="None of these"
              sub="Nothing applies to me"
              active={health.none}
              onPress={() =>
                setHealth({
                  pregnant: false,
                  ed: false,
                  medical: false,
                  none: !health.none,
                })
              }
            />
            {blocked ? (
              <View
                style={[styles.tip, styles.care]}
                accessibilityLiveRegion="polite"
              >
                <Text style={styles.careText}>
                  {health.pregnant
                    ? "Please talk to your doctor before starting any diet plan. Thali isn't made for pregnancy or breastfeeding, so it can't build a plan for you right now. You're welcome to come back with their go-ahead."
                    : 'Please talk to your doctor before trying to lose weight. A calorie deficit isn\'t safe in your situation. You can go back and choose "Stay healthy" to eat well without a deficit.'}
                </Text>
              </View>
            ) : health.medical ? (
              <View style={styles.tip}>
                <Text style={styles.tipText}>
                  Good to know. Please check this plan with your doctor before
                  you start.
                </Text>
              </View>
            ) : health.ed ? (
              <View style={styles.tip}>
                <Text style={styles.tipText}>
                  Thank you for telling us. If counting calories ever feels
                  stressful, take a break and talk to someone you trust.
                </Text>
              </View>
            ) : null}
          </>
        );
      default: {
        if (!valid || !target) return null;
        const m = macroTargets(valid, target.kcal);
        return (
          <View style={styles.center}>
            <Mascot mood="cheer" size={120} />
            <Text style={styles.q}>
              {valid.name ? `${valid.name}, your` : "Your"} plan is ready
            </Text>
            <Text style={styles.kcal}>{shownKcal}</Text>
            <Text style={styles.sub}>calories a day</Text>
            <Text
              style={[styles.muted, { textAlign: "center", marginTop: 6 }]}
              accessibilityLabel="How this number was worked out"
            >
              {target.deficit > 0
                ? `Your body uses about ${target.tdee} kcal a day. We take off ${target.deficit}${valid.targetDate ? " to reach your date" : " for a steady pace"}.`
                : target.surplus > 0
                  ? `Your body uses about ${target.tdee} kcal a day. We add ${target.surplus}${valid.targetDate ? " to reach your date" : " for a steady pace"}.`
                  : `Your body uses about ${target.tdee} kcal a day, so we keep you there.`}
            </Text>
            <View style={styles.macroRow}>
              {[
                ["Protein", m.protein, colors.protein],
                ["Carbs", m.carbs, colors.carbs],
                ["Fats", m.fat, colors.fat],
              ].map(([l, g, c]) => (
                <View key={l as string} style={styles.macro}>
                  <View
                    style={[styles.macroDot, { backgroundColor: c as string }]}
                  />
                  <Text style={styles.macroVal}>{g}g</Text>
                  <Text style={styles.muted}>{l}</Text>
                </View>
              ))}
            </View>
            {weeks ? (
              <View style={styles.tip}>
                <Text style={styles.tipText}>
                  🎯 {valid.weightKg} → {valid.targetWeightKg} kg{" "}
                  {valid.targetDate
                    ? `by ${formatDay(valid.targetDate)}`
                    : `in about ${weeks} weeks`}
                </Text>
              </View>
            ) : valid.goal === "maintain" ? (
              <View style={styles.tip}>
                <Text style={styles.tipText}>
                  ⚖️ Eating at maintenance keeps you at {valid.weightKg} kg
                </Text>
              </View>
            ) : null}
            {target.gainBlocked && (
              <Text
                style={[styles.muted, { textAlign: "center", marginTop: 8 }]}
              >
                Your BMI is already high, so calories are held at maintenance{" "}
                {valid.goal === "muscle" ? "with extra protein " : ""}instead of
                adding more.
              </Text>
            )}
            {target.clampedToFloor && (
              <Text
                style={[styles.muted, { textAlign: "center", marginTop: 8 }]}
              >
                Calories are held at the safe minimum, so progress may be slower
                than the pace you picked.
              </Text>
            )}
            <Text
              style={[styles.muted, { textAlign: "center", marginTop: 16 }]}
            >
              Not medical advice. If you are pregnant, breastfeeding, diabetic
              or on medication, check with a doctor first.
            </Text>
          </View>
        );
      }
    }
  };

  return (
    <SafeAreaView
      style={styles.screen}
      // The keyboard already sits below the footer, so drop the home-bar gap while it is open.
      edges={keyboardOpen ? ["top", "left", "right"] : undefined}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {pos > 0 && (
          <View style={styles.top}>
            <Pressable
              hitSlop={12}
              onPress={() => setPos((s) => s - 1)}
              accessibilityRole="button"
              accessibilityLabel="Back to the previous question"
            >
              <Text style={styles.back}>‹ Back</Text>
            </Pressable>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${(pos / (order.length - 1)) * 100}%` },
                ]}
              />
            </View>
          </View>
        )}
        {pos === 0 && people.list.length > 1 && (
          <View style={styles.top}>
            <Pressable
              hitSlop={12}
              onPress={() => {
                // Leaves this blank person and returns to the first one.
                const back = people.list.find((p) => p.id !== person.id);
                if (back) void remove(person.id);
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel adding a person"
            >
              <Text style={styles.back}>‹ Cancel</Text>
            </Pressable>
          </View>
        )}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Animated.View
            style={{
              opacity: anim,
              transform: [
                {
                  translateX: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
            }}
          >
            {body()}
          </Animated.View>
        </ScrollView>
        <View style={[styles.footer, keyboardOpen && styles.footerKeyboard]}>
          <Pressable
            style={[
              styles.cta,
              (saving || (step === S.health && blocked)) && { opacity: 0.5 },
            ]}
            disabled={saving || (step === S.health && blocked)}
            accessibilityRole="button"
            onPress={last ? finish : next}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>
                {pos === 0
                  ? "Get started"
                  : last
                    ? "Start my plan"
                    : "Continue"}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  back: { color: colors.muted, fontWeight: "600", fontSize: 15 },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    overflow: "hidden",
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  content: { padding: 24, flexGrow: 1 },
  center: { alignItems: "center", paddingTop: 24 },
  brand: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.primaryText,
    marginTop: 8,
  },
  q: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
    textAlign: "left",
  },
  sub: { fontSize: 15, color: colors.muted },
  muted: { fontSize: 13, color: colors.muted },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 16,
  },
  featureEmoji: { fontSize: 26 },
  featureText: { fontSize: 15, color: colors.text, fontWeight: "600", flex: 1 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.tint },
  optionEmoji: { fontSize: 28 },
  optionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.track,
  },
  radioActive: { borderColor: colors.primary, borderWidth: 6 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  input: { flex: 1, fontSize: 20, paddingVertical: 14, color: colors.text },
  unit: { fontSize: 15, color: colors.muted, fontWeight: "600" },
  unitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  unitChip: {
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 32,
    justifyContent: "center",
  },
  unitChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  unitChipText: { fontSize: 13, fontWeight: "700", color: colors.text },
  cmHint: {
    marginTop: -8,
    marginBottom: 12,
    fontSize: 13,
    color: colors.muted,
  },
  tip: {
    backgroundColor: colors.tint,
    padding: 14,
    borderRadius: 14,
    marginTop: 12,
    alignSelf: "stretch",
  },
  tipText: { color: colors.tintText, fontSize: 14, fontWeight: "600" },
  guide: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  guideHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  guideBmi: { fontSize: 20, fontWeight: "800", color: colors.text },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  band: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "visible",
    marginVertical: 4,
  },
  marker: {
    position: "absolute",
    top: -4,
    width: 4,
    height: 18,
    marginLeft: -2,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  guideText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  guideRange: { fontSize: 14, fontWeight: "700", color: colors.primaryText },
  guideNote: { fontSize: 12, color: colors.muted },
  care: { backgroundColor: colors.warnTint, marginTop: 16 },
  careText: {
    color: colors.warnTintText,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  kcal: {
    fontSize: 64,
    fontWeight: "800",
    color: colors.primaryText,
    marginTop: 12,
    fontVariant: ["tabular-nums"],
  },
  macroRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  macro: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.card,
    paddingVertical: 14,
    borderRadius: 16,
  },
  macroDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 6 },
  macroVal: { fontSize: 20, fontWeight: "800", color: colors.text },
  footer: { padding: 20 },
  footerKeyboard: { paddingTop: 10, paddingBottom: 10 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
