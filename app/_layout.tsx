import "../src/ui/webAlert.ts";
import * as Notifications from "../src/ui/notify.ts";
import { router, Stack } from "expo-router";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { loadCustomFoods, migrate } from "../src/db/db.ts";
import { autoBackupIfDue } from "../src/ui/cloudSync.ts";
import { publishFamily } from "../src/ui/familySync.ts";
import { Loading } from "../src/ui/Loading.tsx";
import { syncReminders } from "../src/ui/notifications.ts";
import { PeopleProvider, usePeople } from "../src/ui/People.tsx";
import { colors, isDark } from "../src/ui/theme.ts";
import { ToastProvider } from "../src/ui/Toast.tsx";

/** Opens the screen a reminder points to, and re-plans reminders whenever the app comes back. */
function ReminderObserver() {
  const db = useSQLiteContext();
  useEffect(() => {
    if (Platform.OS === "web") return; // no scheduled notifications in browsers
    const open = (n: Notifications.Notification) => {
      const url = n.request.content.data?.url;
      if (typeof url === "string") router.navigate(url as "/");
    };
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) open(last.notification);
    const tap = Notifications.addNotificationResponseReceivedListener((r) =>
      open(r.notification),
    );
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") syncReminders(db);
    });
    syncReminders(db);
    return () => {
      tap.remove();
      app.remove();
    };
  }, [db]);
  return null;
}

/** Loads the person's own foods before any screen reads a log that uses one. */
function FoodsGate({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    loadCustomFoods(db)
      .catch(() => {})
      .finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [db]);
  return ready ? <>{children}</> : <Loading />;
}

/** Backs up to the cloud about once a day (if switched on) and shares the family summary. */
function AutoBackup() {
  const { people } = usePeople();
  useEffect(() => {
    void autoBackupIfDue(people);
    void publishFamily(people);
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        void autoBackupIfDue(people);
        void publishFamily(people);
      }
    });
    return () => app.remove();
  }, [people]);
  return null;
}

function Shell() {
  const { person, epoch } = usePeople();
  return (
    <SQLiteProvider
      key={`${person.dbName}:${epoch}`}
      databaseName={person.dbName}
      onInit={migrate}
    >
      <FoodsGate>
        <ToastProvider>
          <StatusBar style={isDark ? "light" : "dark"} />
          <ReminderObserver />
          <AutoBackup />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerShadowVisible: false,
              headerTintColor: colors.primaryText,
              headerTitleStyle: { fontWeight: "800", color: colors.text },
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="onboarding"
              options={{ headerShown: false, gestureEnabled: false }}
            />
            <Stack.Screen
              name="add"
              options={{ presentation: "modal", title: "Add food" }}
            />
            <Stack.Screen name="reminders" options={{ title: "Reminders" }} />
            <Stack.Screen name="history" options={{ title: "History" }} />
            <Stack.Screen
              name="edit-profile"
              options={{ title: "Goal and body" }}
            />
            <Stack.Screen name="foods" options={{ title: "My foods" }} />
            <Stack.Screen name="cloud" options={{ title: "Cloud backup" }} />
            <Stack.Screen
              name="about"
              options={{ title: "How calories work" }}
            />
          </Stack>
        </ToastProvider>
      </FoodsGate>
    </SQLiteProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <PeopleProvider>
        <Shell />
      </PeopleProvider>
    </GestureHandlerRootView>
  );
}
