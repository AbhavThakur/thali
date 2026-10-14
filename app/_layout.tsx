import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { migrate } from "../src/db/db.ts";

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="thali.db" onInit={migrate}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="add"
          options={{ presentation: "modal", title: "Add food" }}
        />
      </Stack>
    </SQLiteProvider>
  );
}
