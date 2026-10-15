import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import type { Achievement } from "../domain/rewards.ts";
import { Mascot } from "./Mascot.tsx";
import { colors } from "./theme.ts";

export function Celebration({
  achievement,
  onClose,
}: {
  achievement: Achievement | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={!!achievement}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {achievement && (
          <Animated.View
            entering={ZoomIn.springify().damping(14)}
            style={styles.card}
          >
            <Mascot mood="cheer" size={110} />
            <Text style={styles.kicker}>Achievement unlocked</Text>
            <Text style={styles.emoji}>{achievement.emoji}</Text>
            <Text style={styles.title}>{achievement.title}</Text>
            <Text style={styles.hint}>{achievement.hint}</Text>
            <Pressable
              style={styles.btn}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={styles.btnText}>Yay! 🎉</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    alignSelf: "stretch",
  },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primaryText,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 8,
  },
  emoji: { fontSize: 48, marginTop: 8 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, marginTop: 4 },
  hint: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
    textAlign: "center",
  },
  btn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
