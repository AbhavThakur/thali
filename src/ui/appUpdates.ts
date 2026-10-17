import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Alert } from "react-native";

/** Test builds (npm run e2e:device) must run the code they were built with, never a published update. */
const TEST_BUILD = process.env.EXPO_PUBLIC_E2E === "1";
const EVERY_MS = 30 * 60 * 1000;
let lastCheck = 0;
let busy = false;

/** Downloads a newer version when one was published and offers to restart into it. Never throws. */
export async function checkForAppUpdate() {
  if (TEST_BUILD || !Updates.isEnabled || busy || Date.now() - lastCheck < EVERY_MS) return;
  busy = true;
  lastCheck = Date.now();
  try {
    if (!(await Updates.checkForUpdateAsync()).isAvailable) return;
    if (!(await Updates.fetchUpdateAsync()).isNew) return;
    Alert.alert(
      "A new version is ready",
      "Restart Thali to start using it. Your data stays as it is.",
      [
        { text: "Later", style: "cancel" },
        { text: "Restart now", onPress: () => void Updates.reloadAsync() },
      ],
    );
  } catch {
    // Offline or the server is busy: the next foreground tries again.
  } finally {
    busy = false;
  }
}

/** "Version 1.2.0 · updated 17 Oct", so you can tell which code a phone is running. */
export function versionInfo(): string {
  const version = Constants.expoConfig?.version ?? "?";
  if (TEST_BUILD) return `Version ${version} · test build`;
  if (!Updates.isEnabled) return `Version ${version}`;
  return Updates.isEmbeddedLaunch || !Updates.createdAt
    ? `Version ${version} · original build`
    : `Version ${version} · updated ${Updates.createdAt.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}
