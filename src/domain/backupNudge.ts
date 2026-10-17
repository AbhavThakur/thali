const DAY_MS = 86_400_000;

export type NudgeReason = "own_food" | "streak" | "three_days";

export type Nudge = { reason: NudgeReason; title: string; body: string };

export type NudgeInput = {
  /** True once the phone has a cloud sign-in, with or without an email. */
  signedIn: boolean;
  /** Foods the person added themselves. */
  ownFoods: number;
  /** Days with at least one logged food. */
  loggedDays: number;
  /** Current logging streak. */
  streak: number;
  /** The nudge stays quiet until this time (ms), after "Not now". */
  snoozedUntil: number | null;
  now: number;
};

/** How long "Not now" keeps the nudge away: 2 days, then 5, then 2 weeks. */
export function snoozeUntil(now: number, timesDismissedBefore: number): number {
  const days = [2, 5, 14][Math.min(timesDismissedBefore, 2)];
  return now + days * DAY_MS;
}

/**
 * Asks someone to back up at moments when losing the phone would hurt: after adding their own food,
 * during a 7-day streak, and after a few days of logging. Never before there is something to lose.
 */
export function backupNudge(i: NudgeInput): Nudge | null {
  if (i.signedIn) return null;
  if (i.snoozedUntil != null && i.now < i.snoozedUntil) return null;
  if (i.ownFoods > 0)
    return {
      reason: "own_food",
      title: "Don't lose your own foods",
      body: "The foods you added are only on this phone. Back up to keep them safe. They also help improve Thali for everyone.",
    };
  if (i.streak >= 7)
    return {
      reason: "streak",
      title: `Protect your ${i.streak}-day streak`,
      body: "Your log is only on this phone. A free backup keeps it safe if you lose or change your phone.",
    };
  if (i.loggedDays >= 3)
    return {
      reason: "three_days",
      title: "Keep your progress safe",
      body: "Your log is only on this phone. A free backup keeps it if you lose or change your phone.",
    };
  return null;
}
