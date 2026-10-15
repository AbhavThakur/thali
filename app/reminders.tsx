import { ScrollView } from "react-native";
import { ReminderSettings } from "../src/ui/ReminderSettings.tsx";
import { colors } from "../src/ui/theme.ts";

export default function RemindersScreen() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingVertical: 16 }}
    >
      <ReminderSettings />
    </ScrollView>
  );
}
