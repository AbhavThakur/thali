import { StyleSheet, Text, View } from "react-native";
import { Mascot } from "./Mascot.tsx";
import { colors } from "./theme.ts";

/** Full-screen placeholder while a screen's data loads, instead of a blank flash. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <Mascot mood="thinking" size={96} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  text: { fontSize: 14, color: colors.muted, fontWeight: "600" },
});
