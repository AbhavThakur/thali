import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { colors } from "../../src/ui/theme.ts";

type IconName = keyof typeof Ionicons.glyphMap;
const icon =
  (name: IconName) =>
  ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen
        name="index"
        options={{ title: "Today", tabBarIcon: icon("today-outline") }}
      />
      <Tabs.Screen
        name="plan"
        options={{ title: "Diet Plan", tabBarIcon: icon("restaurant-outline") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: icon("person-outline") }}
      />
    </Tabs>
  );
}
