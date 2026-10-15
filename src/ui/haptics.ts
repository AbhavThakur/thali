import * as Haptics from "expo-haptics";

// Haptics can be unavailable (web, some emulators); feedback must never break an action.
const safe = (fn: () => Promise<void>) => () => {
  fn().catch(() => {});
};

export const haptic = {
  tap: safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: safe(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  ),
  warn: safe(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  ),
};
