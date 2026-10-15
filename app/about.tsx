import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { getProfile } from "../src/db/db.ts";
import {
  ACTIVITY_FACTOR,
  bmr,
  calorieTarget,
  macroTargets,
  MIN_KCAL,
} from "../src/domain/energy.ts";
import type { Profile } from "../src/domain/types.ts";
import { GOAL_LABEL } from "../src/ui/profileForm.ts";
import { card, colors } from "../src/ui/theme.ts";

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

export default function About() {
  const db = useSQLiteContext();
  const [p, setP] = useState<Profile | null>(null);
  useFocusEffect(
    useCallback(() => {
      getProfile(db).then(setP);
    }, [db]),
  );
  const t = p ? calorieTarget(p) : null;
  const m = p && t ? macroTargets(p, t.kcal) : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingVertical: 16 }}
    >
      {p && t && m && (
        <View style={card}>
          <Text style={styles.title}>Your numbers</Text>
          <Line
            label="Resting needs (BMR)"
            value={`${Math.round(bmr(p))} kcal`}
          />
          <Line
            label={`Activity ×${ACTIVITY_FACTOR[p.activity]}`}
            value={`${t.tdee} kcal`}
          />
          <Line
            label={`Goal: ${GOAL_LABEL[p.goal]}`}
            value={
              t.deficit > 0
                ? `− ${t.deficit} kcal`
                : t.surplus > 0
                  ? `+ ${t.surplus} kcal`
                  : "no change"
            }
          />
          <Line label="Your daily target" value={`${t.kcal} kcal`} />
          <Line
            label="Protein · carbs · fat"
            value={`${m.protein} · ${m.carbs} · ${m.fat} g`}
          />
        </View>
      )}

      <View style={card}>
        <Text style={styles.title}>How the target is worked out</Text>
        <Text style={styles.body}>
          1. Resting needs come from the Mifflin-St Jeor formula, using your
          sex, age, height and weight.{"\n"}
          2. That is multiplied by your activity level to get the calories that
          keep your weight steady.{"\n"}
          3. For weight loss we subtract a deficit (about 7,700 kcal per kg of
          body fat), never more than 25% of your needs. To gain, we add a small
          surplus, at most 20% (12% for muscle).{"\n"}
          4. Calories never go below {MIN_KCAL.female} (women) or{" "}
          {MIN_KCAL.male} (men), and we hold at maintenance once you reach your
          goal.
        </Text>
      </View>

      <View style={card}>
        <Text style={styles.title}>Protein, carbs and fat</Text>
        <Text style={styles.body}>
          Protein is 1.2 g per kg to lose weight, 1 g to stay healthy, 1.6 g to
          gain and 1.8 g to build muscle, capped at 30–35% of your calories. Fat
          is about a quarter of your calories and carbs make up the rest.
        </Text>
      </View>

      <View style={card}>
        <Text style={styles.title}>How accurate are food calories?</Text>
        <Text style={styles.body}>
          Food values are home-style estimates per 100 g, cross-checked so
          calories match protein, carbs and fat. Real dishes vary with oil,
          recipe and portion, so expect about 10–15% either way. The numbers are
          most useful for spotting patterns, not for exact counting.{"\n\n"}
          Portions use household measures. A katori is about 150 ml, which is
          roughly 150 g of dal or curry but only about 110 g of cooked rice. Add
          your own dishes under Me → My foods when you know better numbers.
        </Text>
      </View>

      <View style={card}>
        <Text style={styles.title}>Good to know</Text>
        <Text style={styles.body}>
          Thali is a guide, not medical advice. If you are pregnant,
          breastfeeding, diabetic, have a thyroid, kidney or heart condition, or
          take regular medicines, check your plan with a doctor.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
  },
  body: { fontSize: 14, lineHeight: 21, color: colors.text },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.track,
  },
  lineLabel: { fontSize: 14, color: colors.muted, flex: 1 },
  lineValue: { fontSize: 14, fontWeight: "700", color: colors.text },
});
