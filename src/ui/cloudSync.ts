import { openDatabaseAsync } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
import { exportBackup, importBackup, migrate } from "../db/db.ts";
import {
  CloudError,
  createCloud,
  isExpiring,
  type CloudConfig,
  type CloudSession,
} from "../domain/cloud.ts";
import { ensurePerson, type People } from "../domain/people.ts";

const SESSION_KEY = "cloud_session";
const AUTO_KEY = "cloud_auto";
const LAST_KEY = "cloud_last_backup";
const DAY_MS = 20 * 60 * 60 * 1000;

/** Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (see .env.example). */
export function cloudConfig(): CloudConfig | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function loadSession(): CloudSession | null {
  try {
    const raw = Storage.getItemSync(SESSION_KEY);
    return raw ? (JSON.parse(raw) as CloudSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: CloudSession) {
  Storage.setItemSync(SESSION_KEY, JSON.stringify(s));
}

export function signOut() {
  Storage.removeItemSync(SESSION_KEY);
  Storage.removeItemSync(AUTO_KEY);
}

export const autoBackupOn = () => Storage.getItemSync(AUTO_KEY) === "1";
export const setAutoBackup = (on: boolean) =>
  Storage.setItemSync(AUTO_KEY, on ? "1" : "0");
export const lastBackupAt = (): number | null => {
  const v = Storage.getItemSync(LAST_KEY);
  return v ? +v : null;
};

export function getCloud() {
  const cfg = cloudConfig();
  if (!cfg) throw new CloudError("Cloud backup isn't set up in this build.");
  return createCloud(cfg);
}

/** The saved session, refreshed when it is about to expire. Signs out if the server rejects it. */
export async function freshSession(): Promise<CloudSession> {
  const s = loadSession();
  if (!s) throw new CloudError("Sign in first.", 401);
  if (!isExpiring(s, Date.now())) return s;
  try {
    const next = await getCloud().refresh(s);
    saveSession(next);
    return next;
  } catch (e) {
    if (e instanceof CloudError && e.status !== undefined) signOut();
    throw e;
  }
}

/** Uploads every person on this phone; returns how many were saved. */
export async function backupAll(people: People): Promise<number> {
  const cloud = getCloud();
  const session = await freshSession();
  for (const p of people.list) {
    const db = await openDatabaseAsync(p.dbName);
    try {
      await migrate(db);
      await cloud.upload(session, p.id, p.name, await exportBackup(db));
    } finally {
      await db.closeAsync();
    }
  }
  Storage.setItemSync(LAST_KEY, String(Date.now()));
  return people.list.length;
}

/** Replaces each backed-up person's data on this phone with the cloud copy. */
export async function restoreAll(
  people: People,
): Promise<{ people: People; restored: number }> {
  const cloud = getCloud();
  const session = await freshSession();
  const rows = await cloud.list(session);
  let next = people;
  let restored = 0;
  for (const row of rows) {
    const full = await cloud.download(session, row.profileKey);
    const withPerson = full && ensurePerson(next, row.profileKey, row.name);
    if (!full || !withPerson) continue;
    next = withPerson;
    const person = next.list.find((p) => p.id === row.profileKey);
    if (!person) continue;
    const db = await openDatabaseAsync(person.dbName);
    try {
      await migrate(db);
      await importBackup(db, JSON.stringify(full.data));
      restored++;
    } finally {
      await db.closeAsync();
    }
  }
  return { people: next, restored };
}

/** Quietly backs up about once a day when the user has switched that on. Never throws. */
export async function autoBackupIfDue(people: People) {
  try {
    if (!cloudConfig() || !loadSession() || !autoBackupOn()) return;
    const last = lastBackupAt();
    if (last && Date.now() - last < DAY_MS) return;
    await backupAll(people);
  } catch {
    // Try again next time the app opens.
  }
}
