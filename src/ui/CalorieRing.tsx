import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { colors } from "./theme.ts";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
  const color = pct > 0.9 ? colors.warn : colors.primary;
  const mid = size / 2;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(pct, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [pct, progress]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - progress.value),
  }));

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
        <AnimatedCircle
          cx={mid}
          cy={mid}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation={-90}
          origin={`${mid}, ${mid}`}
        />
      </Svg>
      <Text style={styles.big}>{Math.round(consumed).toLocaleString()}</Text>
      <Text style={styles.small}>of {target.toLocaleString()} kcal</Text>
      <Text style={[styles.small, over && { color: colors.warnText }]}>
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
