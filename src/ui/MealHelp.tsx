import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { explainMeal } from "../domain/explain.ts";
import type { Profile, SlotId } from "../domain/types.ts";
import { Sheet, sheetStyles } from "./Sheet.tsx";
import { colors } from "./theme.ts";

/** "How is this worked out?" for a meal card, in this person's own numbers. */
export function MealHelp({
  visible,
  profile,
  slot,
  onClose,
}: {
  visible: boolean;
  profile: Profile;
  slot: SlotId;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={sheetStyles.title}>How this is worked out</Text>
      <ScrollView style={{ maxHeight: 440 }}>
        {explainMeal(profile, slot).map((s) => (
          <View key={s.title} style={styles.block}>
            <Text style={styles.heading}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
      <Pressable
        style={sheetStyles.save}
        onPress={onClose}
        accessibilityRole="button"
      >
        <Text style={sheetStyles.saveText}>Got it</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 14 },
  heading: { fontSize: 15, fontWeight: "800", color: colors.text },
  body: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 2 },
});
