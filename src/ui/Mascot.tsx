import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Ellipse,
  G,
  Path,
  Text as SvgText,
} from "react-native-svg";

export type Mood = "happy" | "cheer" | "proud" | "sleepy" | "thinking";

const INK = "#1E293B";

function Face({ mood }: { mood: Mood }) {
  switch (mood) {
    case "cheer":
      return (
        <G>
          <Path
            d="M40 62 Q46 53 52 62"
            stroke={INK}
            strokeWidth={3.5}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M68 62 Q74 53 80 62"
            stroke={INK}
            strokeWidth={3.5}
            fill="none"
            strokeLinecap="round"
          />
          <Path d="M47 71 Q60 92 73 71 Z" fill="#9F1239" />
          <Path d="M53 78 Q60 84 67 78" fill="#FB7185" />
        </G>
      );
    case "proud":
      return (
        <G>
          <Path
            d="M40 60 Q46 66 52 60"
            stroke={INK}
            strokeWidth={3.5}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M68 60 Q74 66 80 60"
            stroke={INK}
            strokeWidth={3.5}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M48 74 Q60 86 72 74"
            stroke={INK}
            strokeWidth={3.5}
            fill="none"
            strokeLinecap="round"
          />
        </G>
      );
    case "sleepy":
      return (
        <G>
          <Path
            d="M40 62 H52 M68 62 H80"
            stroke={INK}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <Circle cx={60} cy={78} r={4} fill={INK} />
          <SvgText x={88} y={44} fontSize={14} fontWeight="bold" fill="#64748B">
            z
          </SvgText>
        </G>
      );
    case "thinking":
      return (
        <G>
          <Circle cx={47} cy={58} r={4.5} fill={INK} />
          <Circle cx={75} cy={58} r={4.5} fill={INK} />
          <Path
            d="M52 78 H70"
            stroke={INK}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        </G>
      );
    default:
      return (
        <G>
          <Circle cx={46} cy={61} r={4.5} fill={INK} />
          <Circle cx={74} cy={61} r={4.5} fill={INK} />
          <Circle cx={47.5} cy={59.5} r={1.5} fill="#fff" />
          <Circle cx={75.5} cy={59.5} r={1.5} fill="#fff" />
          <Path
            d="M48 74 Q60 86 72 74"
            stroke={INK}
            strokeWidth={3.5}
            fill="none"
            strokeLinecap="round"
          />
        </G>
      );
  }
}

/** "Thali", the app's mascot: a steel plate with three katoris and a face. */
export function Mascot({
  mood = "happy",
  size = 120,
  float = true,
}: {
  mood?: Mood;
  size?: number;
  float?: boolean;
}) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (!float) return;
    y.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [float, y]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View
      style={[{ width: size, height: size }, style]}
      accessibilityLabel={`Thali mascot, ${mood}`}
    >
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Ellipse
          cx={60}
          cy={114}
          rx={34}
          ry={4}
          fill="#0F172A"
          opacity={0.08}
        />
        <Circle
          cx={60}
          cy={66}
          r={46}
          fill="#E2E8F0"
          stroke="#CBD5E1"
          strokeWidth={3}
        />
        <Circle cx={60} cy={66} r={36} fill="#F8FAFC" />
        <Circle
          cx={28}
          cy={34}
          r={11}
          fill="#FCD34D"
          stroke="#CBD5E1"
          strokeWidth={2.5}
        />
        <Circle
          cx={60}
          cy={20}
          r={11}
          fill="#FB923C"
          stroke="#CBD5E1"
          strokeWidth={2.5}
        />
        <Circle
          cx={92}
          cy={34}
          r={11}
          fill="#86EFAC"
          stroke="#CBD5E1"
          strokeWidth={2.5}
        />
        <Ellipse cx={38} cy={72} rx={6} ry={3.5} fill="#FDA4AF" opacity={0.7} />
        <Ellipse cx={82} cy={72} rx={6} ry={3.5} fill="#FDA4AF" opacity={0.7} />
        <Face mood={mood} />
        {mood === "cheer" && (
          <G fill="#F59E0B">
            <Path d="M10 70 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3z" />
            <Path d="M108 60 l2.5 5 5 2.5 -5 2.5 -2.5 5 -2.5 -5 -5 -2.5 5 -2.5z" />
          </G>
        )}
      </Svg>
    </Animated.View>
  );
}
