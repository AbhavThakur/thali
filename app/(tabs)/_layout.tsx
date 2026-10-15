import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useCheers } from "../../src/hooks/useCheers.ts";
import { colors } from "../../src/ui/theme.ts";

type IconName = keyof typeof Ionicons.glyphMap;
const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );

export default function TabsLayout() {
  const cheers = useCheers();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.track,
        },
        tabBarLabelStyle: { fontWeight: "600", fontSize: 12 },
        headerTitleStyle: { fontWeight: "800", color: colors.text },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          headerShown: false,
          tabBarIcon: icon("today-outline"),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{ title: "Diet Plan", tabBarIcon: icon("restaurant-outline") }}
      />
      <Tabs.Screen
        name="progress"
        options={{ title: "Progress", tabBarIcon: icon("stats-chart-outline") }}
      />
      <Tabs.Screen
        name="family"
        options={{
          title: "Family",
          tabBarIcon: icon("people-outline"),
          tabBarBadge: cheers > 0 ? cheers : undefined,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{ title: "Me", tabBarIcon: icon("person-circle-outline") }}
      />
    </Tabs>
  );
}
