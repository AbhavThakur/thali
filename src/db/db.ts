import type { SQLiteDatabase } from "expo-sqlite";
import { normalizeProfile } from "../domain/energy.ts";
import { registerCustomFoods } from "../domain/foods.ts";
import type {
  Food,
  PlanItemInput,
  PlanOverride,
  Profile,
  SlotId,
} from "../domain/types.ts";

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
  const v = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const version = v?.user_version ?? 0;
  if (version < 1) {
    // batch_id groups the rows from one "I ate this" tap so they can be undone together.
    await db.execAsync(`
      ALTER TABLE food_log ADD COLUMN batch_id TEXT;
      PRAGMA user_version = 1;
    `);
  }
  if (version < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS plan_override (
        slot TEXT NOT NULL,
        template_id TEXT NOT NULL,
        date TEXT NOT NULL DEFAULT '',
        items TEXT NOT NULL,
        PRIMARY KEY (slot, template_id, date)
      );
      PRAGMA user_version = 2;
    `);
  }
  if (version < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS weight_log (date TEXT PRIMARY KEY, kg REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS water_log (date TEXT PRIMARY KEY, glasses INTEGER NOT NULL);
      PRAGMA user_version = 3;
    `);
  }
  if (version < 4) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version = 4;
    `);
  }
  if (version < 5) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS custom_food (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS favourite_food (food_id TEXT PRIMARY KEY);
      PRAGMA user_version = 5;
    `);
  }
}

export async function getSetting(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    key,
  );
  return row?.value ?? null;
}

export function setSetting(db: SQLiteDatabase, key: string, value: string) {
  return db.runAsync(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}

export type LogRow = {
  id: number;
  date: string;
  slot: SlotId;
  food_id: string;
  qty: number;
  batch_id: string | null;
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
  return row ? normalizeProfile(JSON.parse(row.data) as Profile) : null;
}

export async function saveProfile(db: SQLiteDatabase, p: Profile) {
  await db.runAsync(
    "INSERT INTO profile (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    JSON.stringify(p),
  );
}

export function getLogs(db: SQLiteDatabase, date: string) {
  return db.getAllAsync<LogRow>(
    "SELECT id, date, slot, food_id, qty, batch_id FROM food_log WHERE date = ? ORDER BY id",
    date,
  );
}

export async function addLogs(
  db: SQLiteDatabase,
  date: string,
  entries: NewLog[],
  batchId: string | null = null,
) {
  await db.withTransactionAsync(async () => {
    for (const e of entries) {
      await db.runAsync(
        "INSERT INTO food_log (date, slot, food_id, qty, batch_id) VALUES (?, ?, ?, ?, ?)",
        date,
        e.slot,
        e.foodId,
        e.qty,
        batchId,
      );
    }
  });
}

export function deleteLog(db: SQLiteDatabase, id: number) {
  return db.runAsync("DELETE FROM food_log WHERE id = ?", id);
}

export function deleteBatch(db: SQLiteDatabase, batchId: string) {
  return db.runAsync("DELETE FROM food_log WHERE batch_id = ?", batchId);
}

/** Most recently logged distinct foods, newest first. */
export async function getRecentFoodIds(
  db: SQLiteDatabase,
  limit = 8,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ food_id: string }>(
    "SELECT food_id FROM food_log GROUP BY food_id ORDER BY MAX(id) DESC LIMIT ?",
    limit,
  );
  return rows.map((r) => r.food_id);
}

/** The quantity each food was last logged with, so Add food can start from what you usually eat. */
export async function getLastQuantities(
  db: SQLiteDatabase,
): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ food_id: string; qty: number }>(
    "SELECT food_id, qty FROM food_log WHERE id IN (SELECT MAX(id) FROM food_log GROUP BY food_id)",
  );
  return Object.fromEntries(rows.map((r) => [r.food_id, r.qty]));
}

export async function getLoggedDates(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ date: string }>(
    "SELECT DISTINCT date FROM food_log ORDER BY date DESC LIMIT ?",
    400,
  );
  return rows.map((r) => r.date);
}

/** Edits that apply on `date`: that day's own plus every-day ones. */
export async function getOverrides(
  db: SQLiteDatabase,
  date: string,
): Promise<PlanOverride[]> {
  const rows = await db.getAllAsync<{
    slot: SlotId;
    template_id: string;
    date: string;
    items: string;
  }>(
    "SELECT slot, template_id, date, items FROM plan_override WHERE date IN (?, '')",
    date,
  );
  return rows.map((r) => ({
    slot: r.slot,
    templateId: r.template_id,
    date: r.date,
    items: JSON.parse(r.items) as PlanItemInput[],
  }));
}

export function saveOverride(db: SQLiteDatabase, o: PlanOverride) {
  return db.runAsync(
    "INSERT INTO plan_override (slot, template_id, date, items) VALUES (?, ?, ?, ?) ON CONFLICT(slot, template_id, date) DO UPDATE SET items = excluded.items",
    o.slot,
    o.templateId,
    o.date,
    JSON.stringify(o.items),
  );
}

/** Back to the suggested option on `date`, dropping both the day edit and the every-day edit. */
export function resetOverride(
  db: SQLiteDatabase,
  slot: SlotId,
  templateId: string,
  date: string,
) {
  return db.runAsync(
    "DELETE FROM plan_override WHERE slot = ? AND template_id = ? AND date IN (?, '')",
    slot,
    templateId,
    date,
  );
}

export type WeightRow = { date: string; kg: number };

export function getWeights(db: SQLiteDatabase) {
  return db.getAllAsync<WeightRow>(
    "SELECT date, kg FROM weight_log ORDER BY date",
  );
}

/** Saves the day's weigh-in and makes it the profile's current weight so targets follow. */
export async function logWeight(db: SQLiteDatabase, date: string, kg: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO weight_log (date, kg) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET kg = excluded.kg",
      date,
      kg,
    );
    const p = await getProfile(db);
    if (p && !(await getSetting(db, "start_kg")))
      await setSetting(db, "start_kg", String(p.weightKg));
    if (p) await saveProfile(db, { ...p, weightKg: kg });
  });
}

export async function getWater(
  db: SQLiteDatabase,
  date: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ glasses: number }>(
    "SELECT glasses FROM water_log WHERE date = ?",
    date,
  );
  return row?.glasses ?? 0;
}

export function setWater(db: SQLiteDatabase, date: string, glasses: number) {
  return db.runAsync(
    "INSERT INTO water_log (date, glasses) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET glasses = excluded.glasses",
    date,
    Math.max(0, glasses),
  );
}

export function getWaterHistory(db: SQLiteDatabase) {
  return db.getAllAsync<{ date: string; glasses: number }>(
    "SELECT date, glasses FROM water_log ORDER BY date",
  );
}

/** Every food log row; history screens aggregate per day in code. */
export function getAllLogs(db: SQLiteDatabase) {
  return db.getAllAsync<LogRow>(
    "SELECT id, date, slot, food_id, qty, batch_id FROM food_log ORDER BY date, id",
  );
}

/** Foods the user added, stored as JSON. */
export async function getCustomFoods(db: SQLiteDatabase): Promise<Food[]> {
  const rows = await db.getAllAsync<{ data: string }>(
    "SELECT data FROM custom_food ORDER BY id",
  );
  return rows.map((r) => JSON.parse(r.data) as Food);
}

/** Puts the saved custom foods into the live food lookup. Call after any change to them. */
export async function loadCustomFoods(db: SQLiteDatabase) {
  registerCustomFoods(await getCustomFoods(db));
}

export function saveCustomFood(db: SQLiteDatabase, f: Food) {
  return db.runAsync(
    "INSERT INTO custom_food (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    f.id,
    JSON.stringify(f),
  );
}

export async function countFoodLogs(
  db: SQLiteDatabase,
  foodId: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM food_log WHERE food_id = ?",
    foodId,
  );
  return row?.n ?? 0;
}

/** Removes a custom food and its favourite mark. Callers check `countFoodLogs` first. */
export async function deleteCustomFood(db: SQLiteDatabase, id: string) {
  await db.runAsync("DELETE FROM custom_food WHERE id = ?", id);
  await db.runAsync("DELETE FROM favourite_food WHERE food_id = ?", id);
}

export async function getFavouriteIds(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ food_id: string }>(
    "SELECT food_id FROM favourite_food ORDER BY rowid",
  );
  return rows.map((r) => r.food_id);
}

/** Adds or removes the favourite mark; returns whether the food is now a favourite. */
export async function toggleFavourite(
  db: SQLiteDatabase,
  foodId: string,
): Promise<boolean> {
  const had = await db.getFirstAsync(
    "SELECT 1 FROM favourite_food WHERE food_id = ?",
    foodId,
  );
  if (had) {
    await db.runAsync("DELETE FROM favourite_food WHERE food_id = ?", foodId);
    return false;
  }
  await db.runAsync("INSERT INTO favourite_food (food_id) VALUES (?)", foodId);
  return true;
}

const BACKUP_TABLES = {
  food_log: ["date", "slot", "food_id", "qty", "batch_id"],
  plan_override: ["slot", "template_id", "date", "items"],
  weight_log: ["date", "kg"],
  water_log: ["date", "glasses"],
  settings: ["key", "value"],
  custom_food: ["id", "data"],
  favourite_food: ["food_id"],
} as const;
type TableName = keyof typeof BACKUP_TABLES;

export type Backup = {
  app: "thali";
  version: 1;
  exportedAt: string;
  profile: Profile | null;
  tables: Record<TableName, Record<string, unknown>[]>;
};

export async function exportBackup(db: SQLiteDatabase): Promise<Backup> {
  const tables = {} as Backup["tables"];
  for (const [name, cols] of Object.entries(BACKUP_TABLES) as [
    TableName,
    readonly string[],
  ][])
    tables[name] = await db.getAllAsync(
      `SELECT ${cols.join(", ")} FROM ${name}`,
    );
  return {
    app: "thali",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: await getProfile(db),
    tables,
  };
}

/** Replaces all data with a backup. Throws on anything that doesn't look like a Thali backup. */
export async function importBackup(db: SQLiteDatabase, text: string) {
  const b = JSON.parse(text) as Partial<Backup>;
  if (
    b?.app !== "thali" ||
    b.version !== 1 ||
    typeof b.tables !== "object" ||
    !b.tables
  )
    throw new Error("This is not a Thali backup.");
  const p = b.profile;
  if (
    p &&
    !(
      ["age", "heightCm", "weightKg", "targetWeightKg", "weeklyLossKg"] as const
    ).every((k) => typeof p[k] === "number" && Number.isFinite(p[k]))
  )
    throw new Error("The profile in this backup is damaged.");
  const tables = b.tables;
  await db.withTransactionAsync(async () => {
    await db.execAsync("DELETE FROM profile;");
    for (const [name, cols] of Object.entries(BACKUP_TABLES) as [
      TableName,
      readonly string[],
    ][]) {
      await db.execAsync(`DELETE FROM ${name};`);
      const rows = Array.isArray(tables[name]) ? tables[name] : [];
      const sql = `INSERT INTO ${name} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      for (const row of rows) {
        const values = cols.map((c) => {
          const v = row?.[c];
          return typeof v === "string" || typeof v === "number" ? v : null;
        });
        await db.runAsync(sql, values);
      }
    }
    if (b.profile) await saveProfile(db, normalizeProfile(b.profile));
  });
}

export async function resetAll(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    for (const name of ["profile", ...Object.keys(BACKUP_TABLES)])
      await db.execAsync(`DELETE FROM ${name};`);
  });
}
