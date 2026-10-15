import { shiftDate, type HistoryDay } from "./history.ts";

/** What one person shares with the family for one day. No foods and no calories, only effort. */
export type FamilyDay = {
  day: string;
  logged: boolean;
  stars: number;
  meals: number;
  waterOk: boolean;
  weightKg: number | null;
};

export type FamilyMember = {
  userId: string;
  name: string;
  emoji: string;
  shareWeight: boolean;
  joinedOn: string;
  streak: number;
};

export type Family = {
  id: string;
  name: string;
  inviteCode: string;
  me: string;
  members: FamilyMember[];
};

export type Kudos = {
  id: number;
  fromUser: string;
  toUser: string;
  emoji: string;
  message: string;
  createdAt: string;
  seen: boolean;
};

export const KUDOS_EMOJI = ["👏", "🔥", "💪", "🥗", "❤️"] as const;
export const MEMBER_EMOJI = ["🙂", "😎", "👩", "👨", "👧", "👦", "👵", "👴"];
export const MAX_MEMBERS = 12;
export const KUDOS_MAX_LENGTH = 80;
export const WEEK_GOAL_DAYS = 5;

const MAIN_MEALS = ["breakfast", "lunch", "dinner"];
const INVITE = /^[A-HJKMNP-Z2-9]{8}$/;

export const normalizeInviteCode = (s: string) =>
  s.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
export const isInviteCode = (s: string) => INVITE.test(normalizeInviteCode(s));
/** "K7MQ4X9R" is shown as "K7MQ-4X9R". */
export const formatInviteCode = (s: string) =>
  normalizeInviteCode(s).replace(/^(.{4})(.+)$/, "$1-$2");

/** Turns history days into the shared summary; weight is only included when the person allows it. */
export function toFamilyDays(
  history: HistoryDay[],
  waterGoal: number,
  shareWeight: boolean,
): FamilyDay[] {
  return history.map((d) => ({
    day: d.date,
    logged: d.logged,
    stars: d.stars?.stars ?? 0,
    meals: d.meals.filter((m) => MAIN_MEALS.includes(m.slot)).length,
    waterOk: d.water >= waterGoal,
    weightKg: shareWeight ? d.weightKg : null,
  }));
}

export type TodayStatus = "done" | "partial" | "none";

/** done = all three main meals, partial = some meals, none = nothing logged yet. */
export function todayStatus(day: FamilyDay | undefined): TodayStatus {
  if (!day || !day.logged) return "none";
  return day.meals >= 3 ? "done" : "partial";
}

/** Monday of the week that contains `date` (weeks run Monday to Sunday). */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((dow + 6) % 7));
}

export type MemberWeek = {
  userId: string;
  /** Days logged this week so far. */
  logged: number;
  /** Days they need to log for the family goal (fewer if they joined mid-week). */
  required: number;
  done: boolean;
  /** False when even logging every remaining day can't reach the goal. */
  reachable: boolean;
};

export type FamilyWeek = {
  start: string;
  end: string;
  members: MemberWeek[];
  allDone: boolean;
  daysLeft: number;
};

type DaysByUser = Map<string, FamilyDay[]>;

function loggedBetween(
  days: FamilyDay[] | undefined,
  from: string,
  to: string,
) {
  return (days ?? []).filter((d) => d.logged && d.day >= from && d.day <= to)
    .length;
}

/** Whole days from `a` to `b` inclusive; 0 if b is before a. */
function daysInclusive(a: string, b: string) {
  const n =
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000 +
    1;
  return Math.max(0, Math.round(n));
}

/** Progress toward "everyone logs `goalDays` days" for the week that contains `today`. */
export function familyWeek(
  members: FamilyMember[],
  daysByUser: DaysByUser,
  today: string,
  goalDays = WEEK_GOAL_DAYS,
): FamilyWeek {
  const start = weekStart(today);
  const end = shiftDate(start, 6);
  const daysLeft = daysInclusive(today, end);
  const rows: MemberWeek[] = members.flatMap((m) => {
    const from = m.joinedOn > start ? m.joinedOn : start;
    const possible = daysInclusive(from, end);
    if (possible === 0) return [];
    const required = Math.min(goalDays, possible);
    const logged = loggedBetween(daysByUser.get(m.userId), start, end);
    return [
      {
        userId: m.userId,
        logged,
        required,
        done: logged >= required,
        reachable: logged + daysLeft >= required,
      },
    ];
  });
  return {
    start,
    end,
    members: rows,
    allDone: rows.length > 0 && rows.every((r) => r.done),
    daysLeft,
  };
}

/**
 * Family streak in weeks: finished weeks in a row where everyone met the goal,
 * plus this week once it is already won. Looks back at most `maxWeeks` weeks.
 */
export function familyStreakWeeks(
  members: FamilyMember[],
  daysByUser: DaysByUser,
  today: string,
  goalDays = WEEK_GOAL_DAYS,
  maxWeeks = 8,
): number {
  let streak = familyWeek(members, daysByUser, today, goalDays).allDone ? 1 : 0;
  let start = shiftDate(weekStart(today), -7);
  for (let i = 0; i < maxWeeks; i++, start = shiftDate(start, -7)) {
    const end = shiftDate(start, 6);
    // Members who had joined by the end of that week.
    const present = members.filter((m) => m.joinedOn <= end);
    if (!present.length) break;
    const week = familyWeek(present, daysByUser, end, goalDays);
    // `end` is a Sunday, so familyWeek covers exactly that week with no days left.
    if (!week.allDone) break;
    streak++;
  }
  return streak;
}

/** Short names for the kudos inbox; falls back to "Someone" for people who have left. */
export function nameOf(members: FamilyMember[], userId: string): string {
  return members.find((m) => m.userId === userId)?.name ?? "Someone";
}

export const cleanKudosMessage = (s: string) =>
  s.trim().slice(0, KUDOS_MAX_LENGTH);

export function timeAgo(iso: string, nowMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** The newest shared weight, or null when nothing is shared. `days` may be in any order. */
export function latestWeight(days: FamilyDay[] | undefined): number | null {
  const withWeight = (days ?? []).filter((d) => d.weightKg != null);
  if (!withWeight.length) return null;
  return withWeight.reduce((a, b) => (b.day > a.day ? b : a)).weightKg;
}
