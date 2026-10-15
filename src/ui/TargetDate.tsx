import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatDay,
  timelinePresets,
  type Timeline,
  type TimelinePlan,
} from "../domain/timeline.ts";
import type { Profile } from "../domain/types.ts";
import { haptic } from "./haptics.ts";
import { colors } from "./theme.ts";

/** Suggests a date to reach the target and lets someone adjust it, or skip it (calories still follow a steady pace). */
export function TargetDate({
  base,
  timeline,
  plan,
  from,
  onWeeks,
  dated,
  onDated,
}: {
  base: Profile;
  timeline: Timeline;
  plan: TimelinePlan;
  from: string;
  onWeeks: (weeks: number) => void;
  dated: boolean;
  onDated: (on: boolean) => void;
}) {
  if (!dated)
    return (
      <View style={styles.summary} accessibilityLiveRegion="polite">
        <Text style={styles.small}>No target date</Text>
        <Text style={styles.line}>Steady pace of {plan.rateKg} kg a week</Text>
        <Text style={styles.kcal}>{plan.kcal} kcal a day</Text>
        <Pressable
          onPress={() => onDated(true)}
          style={styles.linkBtn}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>Show me a suggested date</Text>
        </Pressable>
      </View>
    );

  const presets = timelinePresets(base, from);
  const atFastest = plan.weeks <= timeline.minWeeks;
  const atSlowest = plan.weeks >= timeline.maxWeeks;
  const step = (delta: number) => {
    haptic.tap();
    onWeeks(plan.weeks + delta);
  };
  const stepper: [number, string, string][] = [
    [-4, "−4", "Four weeks earlier"],
    [-1, "−1", "One week earlier"],
    [1, "+1", "One week later"],
    [4, "+4", "Four weeks later"],
  ];

  return (
    <View>
      <View style={styles.summary} accessibilityLiveRegion="polite">
        <Text style={styles.small}>
          Suggested date for {base.weightKg} → {base.targetWeightKg} kg
        </Text>
        <Text style={styles.date}>{formatDay(plan.date)}</Text>
        <Text style={styles.line}>
          {plan.weeks} weeks · {plan.rateKg} kg a week
        </Text>
        <Text style={styles.kcal}>{plan.kcal} kcal a day</Text>
      </View>

      {presets.map((p) => {
        const active = p.weeks === plan.weeks;
        return (
          <Pressable
            key={p.id}
            onPress={() => {
              haptic.tap();
              onWeeks(p.weeks);
            }}
            style={[styles.option, active && styles.optionActive]}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, selected: active }}
            accessibilityLabel={`${p.label}. ${formatDay(p.date)}. ${p.rateKg} kilos a week. ${p.kcal} calories a day.`}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>{p.label}</Text>
              <Text style={styles.muted}>
                {formatDay(p.date)} · {p.rateKg} kg/week · {p.kcal} kcal/day
              </Text>
            </View>
            <View style={[styles.radio, active && styles.radioActive]} />
          </Pressable>
        );
      })}

      <Text style={styles.label}>Or choose your own date</Text>
      <View style={styles.stepper}>
        {stepper.slice(0, 2).map(([d, label, a11y]) => (
          <StepButton
            key={d}
            label={label}
            a11y={a11y}
            disabled={atFastest}
            onPress={() => step(d)}
          />
        ))}
        <Text style={styles.stepDate}>{formatDay(plan.date)}</Text>
        {stepper.slice(2).map(([d, label, a11y]) => (
          <StepButton
            key={d}
            label={label}
            a11y={a11y}
            disabled={atSlowest}
            onPress={() => step(d)}
          />
        ))}
      </View>
      <Text style={styles.note}>
        {atFastest
          ? "This is the quickest safe date for you. Going faster would mean eating too little."
          : atSlowest
            ? "Longer than this is hard to stick to."
            : plan.weeks < timeline.recommendedWeeks
              ? "Quicker than recommended, so portions will be smaller."
              : "Later dates mean more food each day and are easier to keep up."}
      </Text>
      <Pressable
        onPress={() => onDated(false)}
        style={styles.linkBtn}
        accessibilityRole="button"
      >
        <Text style={styles.linkText}>Skip: I don't want a target date</Text>
      </Pressable>
    </View>
  );
}

function StepButton({
  label,
  a11y,
  disabled,
  onPress,
}: {
  label: string;
  a11y: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.stepBtn, disabled && { opacity: 0.35 }]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Text style={styles.stepBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: colors.tint,
    borderRadius: 18,
    padding: 18,
    alignItems: "center",
    marginBottom: 16,
  },
  small: { fontSize: 14, color: colors.tintText, fontWeight: "600" },
  date: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.primaryText,
    marginTop: 4,
  },
  line: { fontSize: 15, color: colors.text, marginTop: 4, fontWeight: "600" },
  kcal: { fontSize: 15, color: colors.tintText, marginTop: 2 },
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
  optionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  muted: { fontSize: 13, color: colors.muted, marginTop: 2 },
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
    marginTop: 8,
    marginBottom: 6,
  },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.track,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: { fontSize: 15, fontWeight: "800", color: colors.text },
  stepDate: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  note: { fontSize: 13, color: colors.muted, marginTop: 10, lineHeight: 18 },
  linkBtn: { marginTop: 14, minHeight: 44, justifyContent: "center" },
  linkText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
});
