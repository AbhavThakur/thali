import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "./theme.ts";

export function CalorieRing({
  consumed,
  target,
  size = 140,
}: {
  consumed: number;
  target: number;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const over = consumed > target;
  const color = over ? colors.danger : pct > 0.9 ? colors.warn : colors.primary;
  const mid = size / 2;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={mid}
          cy={mid}
          r={r}
          stroke={colors.track}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={mid}
          cy={mid}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          rotation={-90}
          origin={`${mid}, ${mid}`}
        />
      </Svg>
      <Text style={styles.big}>{Math.round(consumed).toLocaleString()}</Text>
      <Text style={styles.small}>of {target.toLocaleString()} kcal</Text>
      <Text style={[styles.small, over && { color: colors.danger }]}>
        {over
          ? `${Math.round(consumed - target)} over`
          : `${Math.round(target - consumed)} left`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  big: { fontSize: 26, fontWeight: "700", color: colors.text },
  small: { fontSize: 12, color: colors.muted },
});
