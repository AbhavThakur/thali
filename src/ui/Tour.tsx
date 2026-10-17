import { useCallback, useEffect, useState, type RefObject } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "./haptics.ts";
import { Mascot } from "./Mascot.tsx";
import { colors } from "./theme.ts";

export type TourStep = {
  title: string;
  body: string;
  /** Element to highlight; omit and set `tab` to point at a bottom tab instead. */
  target?: RefObject<View | null>;
  tab?: number;
};

type Rect = { x: number; y: number; w: number; h: number };

const PAD = 6;
const TAB_COUNT = 5;
const TAB_BAR = 56;

const measure = (ref: RefObject<View | null>) =>
  new Promise<Rect | null>((resolve) => {
    if (!ref.current) return resolve(null);
    ref.current.measureInWindow((x, y, w, h) =>
      resolve(w || h ? { x, y, w, h } : null),
    );
  });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** First-run coach marks: dims the screen, cuts out the target, explains it. */
export function Tour({
  steps,
  visible,
  scrollBy,
  onDone,
}: {
  steps: TourStep[];
  visible: boolean;
  /** Scrolls the screen so an off-screen target comes into view. */
  scrollBy: (dy: number) => void;
  onDone: () => void;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[i];

  const locate = useCallback(async () => {
    setRect(null);
    if (!step) return;
    if (step.tab != null) {
      const tw = W / TAB_COUNT;
      return setRect({
        x: tw * step.tab,
        y: H - TAB_BAR - insets.bottom,
        w: tw,
        h: TAB_BAR,
      });
    }
    if (!step.target) return;
    let r = await measure(step.target);
    if (r && (r.y < insets.top + 40 || r.y + r.h > H - 300)) {
      scrollBy(r.y - insets.top - 120);
      await wait(400);
      r = await measure(step.target);
    }
    setRect(r);
  }, [step, W, H, insets, scrollBy]);

  useEffect(() => {
    if (visible) locate();
  }, [visible, locate]);
  useEffect(() => {
    if (visible) setI(0);
  }, [visible]);

  const next = () => {
    haptic.tap();
    if (i + 1 < steps.length) setI(i + 1);
    else onDone();
  };

  const hole = rect && {
    x: rect.x - PAD,
    y: rect.y - PAD,
    w: rect.w + PAD * 2,
    h: rect.h + PAD * 2,
  };
  const below = !hole || hole.y + hole.h < H * 0.55;
  const cardTop = hole ? (below ? hole.y + hole.h + 12 : undefined) : H * 0.3;
  const cardBottom = hole && !below ? H - hole.y + 12 : undefined;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={onDone}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {hole ? (
          <>
            <View
              style={[
                styles.dim,
                { left: 0, right: 0, top: 0, height: Math.max(0, hole.y) },
              ]}
            />
            <View
              style={[
                styles.dim,
                { left: 0, right: 0, top: hole.y + hole.h, bottom: 0 },
              ]}
            />
            <View
              style={[
                styles.dim,
                {
                  left: 0,
                  width: Math.max(0, hole.x),
                  top: hole.y,
                  height: hole.h,
                },
              ]}
            />
            <View
              style={[
                styles.dim,
                {
                  left: hole.x + hole.w,
                  right: 0,
                  top: hole.y,
                  height: hole.h,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.ring,
                { left: hole.x, top: hole.y, width: hole.w, height: hole.h },
              ]}
            />
          </>
        ) : (
          <View style={[styles.dim, StyleSheet.absoluteFill]} />
        )}

        {step && (
          <Animated.View
            key={i}
            entering={FadeIn.duration(220)}
            style={[styles.card, { top: cardTop, bottom: cardBottom }]}
            accessibilityViewIsModal
          >
            <View style={styles.cardHead}>
              <Mascot
                mood={i === steps.length - 1 ? "cheer" : "happy"}
                size={44}
                float={false}
              />
              <Text style={styles.title}>{step.title}</Text>
            </View>
            <Text style={styles.body}>{step.body}</Text>
            <View style={styles.footer}>
              <View style={styles.dots}>
                {steps.map((_, n) => (
                  <View key={n} style={[styles.dot, n === i && styles.dotOn]} />
                ))}
              </View>
              {i + 1 < steps.length && (
                <Pressable
                  hitSlop={10}
                  onPress={onDone}
                  accessibilityRole="button"
                >
                  <Text style={styles.skip}>Skip</Text>
                </Pressable>
              )}
              <Pressable
                style={styles.next}
                onPress={next}
                accessibilityRole="button"
              >
                <Text style={styles.nextText}>
                  {i + 1 < steps.length ? "Next" : "Let's go!"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { position: "absolute", backgroundColor: "rgba(15,23,42,0.72)" },
  ring: {
    position: "absolute",
    borderRadius: 16,
    borderWidth: 3,
    borderColor: "#6EE7B7",
  },
  card: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 18, fontWeight: "800", color: colors.text, flex: 1 },
  body: { fontSize: 15, color: colors.text, lineHeight: 21, marginTop: 8 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 16,
  },
  dots: { flexDirection: "row", gap: 5, flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.track },
  dotOn: { backgroundColor: colors.primary, width: 16 },
  skip: { color: colors.muted, fontWeight: "700" },
  next: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  nextText: { color: "#fff", fontWeight: "800" },
});
