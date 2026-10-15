import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { migrate } from "../db/db.ts";

let active: { dbName: string; db: SQLiteDatabase } | null = null;

/** The screen tree registers the database it already has open; returns the function that unregisters it. */
export function registerActiveDb(dbName: string, db: SQLiteDatabase) {
  active = { dbName, db };
  return () => {
    if (active?.db === db) active = null;
  };
}

/**
 * Runs `fn` on a person's database. The one the app already has open is reused, because on web a second
 * connection to the same file is refused; other people's databases are opened and closed here.
 */
export async function withDb<T>(
  dbName: string,
  fn: (db: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  if (active?.dbName === dbName) return fn(active.db);
  const db = await openDatabaseAsync(dbName);
  try {
    await migrate(db);
    return await fn(db);
  } finally {
    await db.closeAsync();
  }
}
