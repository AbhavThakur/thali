import { StyleSheet, Text, View } from "react-native";
import type { Macros } from "../domain/types.ts";
import { colors } from "./theme.ts";

const ROWS = [
  { key: "protein", label: "Protein", color: colors.protein, warnOver: false },
  { key: "carbs", label: "Carbs", color: colors.carbs, warnOver: true },
  { key: "fat", label: "Fats", color: colors.fat, warnOver: true },
  { key: "fiber", label: "Fiber", color: colors.fiber, warnOver: false },
] as const;

export function MacroBars({
  consumed,
  target,
}: {
  consumed: Macros;
  target: Macros;
}) {
  return (
    <View style={styles.wrap}>
      {ROWS.map(({ key, label, color, warnOver }) => {
        const v = Math.round(consumed[key]);
        const t = target[key];
        const warn = warnOver && v > t;
        return (
          <View key={key}>
            <View style={styles.row}>
              <Text style={styles.label}>
                {label}
                {warn ? <Text style={{ color: colors.danger }}> !</Text> : null}
              </Text>
              <Text style={[styles.value, warn && { color: colors.danger }]}>
                {v}g/{t}g
              </Text>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.min(100, t ? (v / t) * 100 : 0)}%`,
                    backgroundColor: warn ? colors.danger : color,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  label: { fontSize: 13, color: colors.text, fontWeight: "600" },
  value: { fontSize: 12, color: colors.muted },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    overflow: "hidden",
  },
  fill: { height: 6, borderRadius: 3 },
});
