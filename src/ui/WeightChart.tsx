import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { movingAverage } from "../domain/rewards.ts";
import { colors } from "./theme.ts";

/** Weigh-ins as dots, 7-entry average as a line, target as a dashed line. */
export function WeightChart({
  points,
  targetKg,
  width,
  height = 160,
}: {
  points: { date: string; kg: number }[];
  targetKg: number;
  width: number;
  height?: number;
}) {
  if (points.length < 2)
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.muted}>
          Log your weight on two days to see your trend.
        </Text>
      </View>
    );

  const pad = 12;
  const kgs = points.map((p) => p.kg);
  const lo = Math.min(...kgs, targetKg) - 1;
  const hi = Math.max(...kgs) + 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (kg: number) => pad + ((hi - kg) / (hi - lo)) * (height - pad * 2);
  const avg = movingAverage(kgs);
  const d = avg
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  return (
    <Svg width={width} height={height}>
      <Line
        x1={pad}
        x2={width - pad}
        y1={y(targetKg)}
        y2={y(targetKg)}
        stroke={colors.primary}
        strokeDasharray="6 6"
        strokeWidth={1.5}
      />
      {kgs.map((kg, i) => (
        <Circle
          key={points[i].date}
          cx={x(i)}
          cy={y(kg)}
          r={3}
          fill={colors.muted}
          opacity={0.5}
        />
      ))}
      <Path
        d={d}
        stroke={colors.primary}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  muted: { color: colors.muted, fontSize: 13, textAlign: "center" },
});
