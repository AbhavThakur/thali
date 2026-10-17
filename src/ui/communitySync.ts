import Storage from "./kv";
import { withDb } from "./dbAccess.ts";
import { getCustomFoods } from "../db/db.ts";
import { registerCommunityFoods } from "../domain/foods.ts";
import type { People } from "../domain/people.ts";
import { foodFingerprint, type SubmissionInfo } from "../domain/sharedFoods.ts";
import type { Food } from "../domain/types.ts";
import {
  cloudConfig,
  freshSession,
  getCloud,
  loadSession,
} from "./cloudSync.ts";

// Everything here lives on the phone (not in a person's database), because the shared list and the
// account are the same for everyone using this phone.
const LIST_KEY = "community_foods";
const LIST_AT_KEY = "community_foods_at";
const STATUS_KEY = "community_status";
const SENT_KEY = "community_sent";
const LAST_KEY = "community_last_sync";

const REFRESH_LIST_MS = 12 * 60 * 60 * 1000;
const SYNC_EVERY_MS = 10 * 60 * 1000;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = Storage.getItemSync(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const write = (key: string, value: unknown) =>
  Storage.setItemSync(key, JSON.stringify(value));

/** What the cloud last said about each food this phone sent, keyed by the food's id on the phone. */
export const loadSubmissions = () =>
  read<Record<string, SubmissionInfo>>(STATUS_KEY, {});

let cachedList: Food[] | null = null;
const sharedList = () => (cachedList ??= read<Food[]>(LIST_KEY, []));

/**
 * Puts the downloaded shared foods into the food lookup, and swaps the person's own foods for their
 * checked versions. Cheap, so screens call it at start-up and after every sync.
 */
export function applyCommunityCache() {
  const aliases: Record<string, string> = {};
  for (const [own, info] of Object.entries(loadSubmissions()))
    if (info.status === "approved" && info.communityId)
      aliases[own] = info.communityId;
  registerCommunityFoods(sharedList(), aliases);
}

/** Sends every own food that is new or changed, from every person's database. One bad food doesn't block the rest. */
async function submitOwnFoods(people: People) {
  const session = await freshSession();
  const cloud = getCloud();
  const sent = read<Record<string, string>>(SENT_KEY, {});
  const all = new Map<string, Food>();
  for (const p of people.list) {
    const own = await withDb(p.dbName, (db) => getCustomFoods(db));
    for (const f of own) if (!f.quick) all.set(f.id, f);
  }
  for (const f of all.values()) {
    const fp = foodFingerprint(f);
    if (sent[f.id] === fp) continue;
    try {
      await cloud.submitFood(session, f.id, f);
    } catch {
      continue; // the server refused it (or we are offline); it is tried again next time
    }
    sent[f.id] = fp;
    write(SENT_KEY, sent);
  }
  return session;
}

async function refreshList() {
  const foods = await getCloud().approvedFoods();
  cachedList = foods;
  write(LIST_KEY, foods);
  Storage.setItemSync(LIST_AT_KEY, String(Date.now()));
}

let running: Promise<void> | null = null;

async function run(people: People, force: boolean) {
  if (!cloudConfig()) return;
  const last = Number(Storage.getItemSync(LAST_KEY) ?? 0);
  if (!force && Date.now() - last < SYNC_EVERY_MS) return;
  Storage.setItemSync(LAST_KEY, String(Date.now()));

  let needList =
    force ||
    !sharedList().length ||
    Date.now() - Number(Storage.getItemSync(LIST_AT_KEY) ?? 0) >
      REFRESH_LIST_MS;

  if (loadSession()) {
    try {
      const session = await submitOwnFoods(people);
      const subs = await getCloud().mySubmissions(session);
      write(STATUS_KEY, subs);
      // A food was just approved but the list on the phone is older than that: fetch it now.
      const have = new Set(sharedList().map((f) => f.id));
      needList ||= Object.values(subs).some(
        (s) => s.communityId && !have.has(s.communityId),
      );
    } catch {
      // Signed out, offline or rate limited: try again next time.
    }
  }
  if (needList) await refreshList().catch(() => {});
  applyCommunityCache();
}

/**
 * Sends the person's own foods to be checked, learns what happened to them, and refreshes the shared list.
 * Never throws; with no sign-in the foods simply wait. `force` ignores the "not too often" limit.
 */
export function syncCommunity(people: People, force = false): Promise<void> {
  if (running) return running;
  const p = run(people, force)
    .catch(() => {})
    .finally(() => {
      running = null;
    });
  running = p;
  return p;
}
