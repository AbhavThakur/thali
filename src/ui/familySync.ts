import { openDatabaseAsync } from "expo-sqlite";
import Storage from "./kv";
import {
  getAllLogs,
  getProfile,
  getWaterHistory,
  getWeights,
  loadCustomFoods,
  migrate,
  today,
} from "../db/db.ts";
import { CloudError } from "../domain/cloud.ts";
import { calorieTarget, macroTargets } from "../domain/energy.ts";
import {
  cleanKudosMessage,
  toFamilyDays,
  type Family,
  type FamilyDay,
  type Kudos,
} from "../domain/family.ts";
import { buildHistory, shiftDate } from "../domain/history.ts";
import type { People } from "../domain/people.ts";
import { loggingStreak } from "../domain/streak.ts";
import { WATER_GOAL } from "../hooks/useProgress.ts";
import {
  cloudConfig,
  freshSession,
  getCloud,
  loadSession,
} from "./cloudSync.ts";

const ON_KEY = "family_on";
const ME_KEY = "family_me";
const LAST_KEY = "family_last_publish";
const PUBLISH_DAYS = 14;
const WEEKS_BACK = 8;
const PUBLISH_EVERY_MS = 60 * 1000;

/** How this phone appears in the family. Kept on the phone so publishing needs no extra lookup. */
export type FamilyMe = {
  name: string;
  emoji: string;
  shareWeight: boolean;
  /** Which person on this phone is shared. */
  profileKey: string;
};

export type FamilySnapshot = {
  family: Family;
  days: Map<string, FamilyDay[]>;
  kudos: Kudos[];
};

export const familyOn = () => Storage.getItemSync(ON_KEY) === "1";

export function loadFamilyMe(): FamilyMe | null {
  try {
    const raw = Storage.getItemSync(ME_KEY);
    return raw ? (JSON.parse(raw) as FamilyMe) : null;
  } catch {
    return null;
  }
}

function saveFamilyMe(me: FamilyMe) {
  Storage.setItemSync(ME_KEY, JSON.stringify(me));
}

function forget() {
  Storage.removeItemSync(ON_KEY);
  Storage.removeItemSync(ME_KEY);
  Storage.removeItemSync(LAST_KEY);
}

/** Keeps the phone's copy in step with what the server says about me. */
function remember(family: Family, profileKey: string) {
  const mine = family.members.find((m) => m.userId === family.me);
  if (!mine) return;
  Storage.setItemSync(ON_KEY, "1");
  saveFamilyMe({
    name: mine.name,
    emoji: mine.emoji,
    shareWeight: mine.shareWeight,
    profileKey: loadFamilyMe()?.profileKey ?? profileKey,
  });
}

/** Builds the last two weeks of the shared person's days and shares them. Throws on failure. */
async function publishNow(people: People) {
  const me = loadFamilyMe();
  if (!me) return;
  const person =
    people.list.find((p) => p.id === me.profileKey) ?? people.list[0];
  const session = await freshSession();
  const db = await openDatabaseAsync(person.dbName);
  let days: FamilyDay[];
  let streak: number;
  try {
    await migrate(db);
    const profile = await getProfile(db);
    if (!profile) return;
    await loadCustomFoods(db);
    const [logs, water, weights] = await Promise.all([
      getAllLogs(db),
      getWaterHistory(db),
      getWeights(db),
    ]);
    const to = today();
    const target = macroTargets(profile, calorieTarget(profile).kcal);
    days = toFamilyDays(
      buildHistory(
        { logs, water, weights, target },
        shiftDate(to, -(PUBLISH_DAYS - 1)),
        to,
      ),
      WATER_GOAL,
      me.shareWeight,
    );
    streak = loggingStreak(
      logs.map((l) => l.date),
      to,
    );
  } finally {
    await db.closeAsync();
  }
  const cloud = getCloud();
  await cloud.updateMember(session, {
    name: me.name,
    emoji: me.emoji,
    shareWeight: me.shareWeight,
    streak,
  });
  await cloud.publishDays(session, days);
  Storage.setItemSync(LAST_KEY, String(Date.now()));
}

/** Shares today's summary at most every few minutes. Never throws; does nothing if there is no family. */
export async function publishFamily(people: People, force = false) {
  try {
    if (!cloudConfig() || !loadSession() || !familyOn()) return;
    const last = Number(Storage.getItemSync(LAST_KEY) ?? 0);
    if (!force && Date.now() - last < PUBLISH_EVERY_MS) return;
    await publishNow(people);
  } catch {
    // Try again the next time the app opens or the Family tab is shown.
  }
}

/** Reads the family, everyone's recent days and my cheers. Null when I'm not in a family. */
export async function loadFamily(): Promise<FamilySnapshot | null> {
  const cloud = getCloud();
  const session = await freshSession();
  const family = await cloud.familyOverview(session);
  if (!family) {
    forget();
    return null;
  }
  remember(family, "");
  const from = shiftDate(today(), -WEEKS_BACK * 7);
  const [days, kudos] = await Promise.all([
    cloud.familyDays(session, from),
    cloud.myKudos(session, family.me),
  ]);
  return { family, days, kudos };
}

export async function createFamily(
  people: People,
  familyName: string,
  name: string,
  emoji: string,
) {
  const family = await getCloud().createFamily(
    await freshSession(),
    familyName.trim(),
    name.trim(),
    emoji,
  );
  remember(family, people.active);
  await publishFamily(people, true);
  return family;
}

export async function joinFamily(
  people: People,
  code: string,
  name: string,
  emoji: string,
) {
  const family = await getCloud().joinFamily(
    await freshSession(),
    code,
    name.trim(),
    emoji,
  );
  remember(family, people.active);
  await publishFamily(people, true);
  return family;
}

export async function leaveFamily() {
  await getCloud().leaveFamily(await freshSession());
  forget();
}

export async function newInviteCode() {
  return getCloud().newInviteCode(await freshSession());
}

/** Changes who this phone shares, or whether weight is shared, and publishes right away. */
export async function updateFamilyMe(people: People, patch: Partial<FamilyMe>) {
  const me = loadFamilyMe();
  if (!me) throw new CloudError("Join a family first.");
  saveFamilyMe({ ...me, ...patch });
  try {
    await publishNow(people);
  } catch (e) {
    saveFamilyMe(me);
    throw e;
  }
}

export async function sendCheer(
  toUser: string,
  emoji: string,
  message: string,
) {
  await getCloud().sendKudos(
    await freshSession(),
    toUser,
    emoji,
    cleanKudosMessage(message),
  );
}

export async function markCheersSeen() {
  await getCloud().markKudosSeen(await freshSession());
  setCheerCount(0);
}

let cheerCache: { at: number; count: number } | null = null;
const cheerListeners = new Set<(n: number) => void>();

function setCheerCount(count: number) {
  cheerCache = { at: Date.now(), count };
  cheerListeners.forEach((fn) => fn(count));
}

/** Calls `fn` whenever the unread cheer count changes; returns the unsubscribe function. */
export function subscribeCheers(fn: (n: number) => void) {
  cheerListeners.add(fn);
  return () => {
    cheerListeners.delete(fn);
  };
}

/** Number of cheers I haven't opened yet. Cached for a couple of minutes and never throws. */
export async function unseenCheers(force = false): Promise<number> {
  if (!cloudConfig() || !loadSession() || !familyOn()) return 0;
  if (!force && cheerCache && Date.now() - cheerCache.at < 2 * 60 * 1000)
    return cheerCache.count;
  try {
    const cloud = getCloud();
    const session = await freshSession();
    const family = await cloud.familyOverview(session);
    const count = family
      ? (await cloud.myKudos(session, family.me)).filter((k) => !k.seen).length
      : 0;
    setCheerCount(count);
    return count;
  } catch {
    return cheerCache?.count ?? 0;
  }
}

/** Forgets the count, e.g. after leaving the family. */
export const clearCheerCache = () => {
  setCheerCount(0);
  cheerCache = null;
};
