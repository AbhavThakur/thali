import type { SQLiteDatabase } from "expo-sqlite";
import type { Profile, SlotId } from "../domain/types.ts";

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS food_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      slot TEXT NOT NULL,
      food_id TEXT NOT NULL,
      qty REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_food_log_date ON food_log(date);
  `);
}

export type LogRow = {
  id: number;
  date: string;
  slot: SlotId;
  food_id: string;
  qty: number;
};
export type NewLog = { slot: SlotId; foodId: string; qty: number };

/** Local calendar date, YYYY-MM-DD. */
export function today(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export async function getProfile(db: SQLiteDatabase): Promise<Profile | null> {
  const row = await db.getFirstAsync<{ data: string }>(
    "SELECT data FROM profile WHERE id = 1",
  );
  return row ? (JSON.parse(row.data) as Profile) : null;
}

export async function saveProfile(db: SQLiteDatabase, p: Profile) {
  await db.runAsync(
    "INSERT INTO profile (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    JSON.stringify(p),
  );
}

export function getLogs(db: SQLiteDatabase, date: string) {
  return db.getAllAsync<LogRow>(
    "SELECT id, date, slot, food_id, qty FROM food_log WHERE date = ? ORDER BY id",
    date,
  );
}

export async function addLogs(
  db: SQLiteDatabase,
  date: string,
  entries: NewLog[],
) {
  await db.withTransactionAsync(async () => {
    for (const e of entries) {
      await db.runAsync(
        "INSERT INTO food_log (date, slot, food_id, qty) VALUES (?, ?, ?, ?)",
        date,
        e.slot,
        e.foodId,
        e.qty,
      );
    }
  });
}

export function deleteLog(db: SQLiteDatabase, id: number) {
  return db.runAsync("DELETE FROM food_log WHERE id = ?", id);
}
