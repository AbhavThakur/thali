// Deep imports on purpose: the package index also loads push-only "topic subscription" code,
// whose native module is missing from Expo Go on Android and crashes every route at startup.
export { setNotificationHandler } from "expo-notifications/build/NotificationsHandler";
export { scheduleNotificationAsync } from "expo-notifications/build/scheduleNotificationAsync";
export { cancelAllScheduledNotificationsAsync } from "expo-notifications/build/cancelAllScheduledNotificationsAsync";
export { setNotificationChannelAsync } from "expo-notifications/build/setNotificationChannelAsync";
export {
  getPermissionsAsync,
  requestPermissionsAsync,
} from "expo-notifications/build/NotificationPermissions";
export {
  addNotificationResponseReceivedListener,
  getLastNotificationResponse,
} from "expo-notifications/build/NotificationsEmitter";
export { SchedulableTriggerInputTypes } from "expo-notifications/build/Notifications.types";
export type { Notification } from "expo-notifications/build/Notifications.types";
export { AndroidImportance } from "expo-notifications/build/NotificationChannelManager.types";
