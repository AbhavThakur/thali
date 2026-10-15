import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  exportBackup,
  getProfile,
  getSetting,
  importBackup,
  migrate,
} from "../../db/db.ts";

// A small stand-in for expo-sqlite's async API on top of Node's SQLite, so the real migration code runs.
function openDb() {
  const raw = new DatabaseSync(":memory:");
  const args = (p: unknown[]) => p.flat() as never[];
  const db = {
    raw,
    execAsync: async (sql: string) => void raw.exec(sql),
    getFirstAsync: async (sql: string, ...p: unknown[]) =>
      raw.prepare(sql).get(...args(p)) ?? null,
    getAllAsync: async (sql: string, ...p: unknown[]) =>
      raw.prepare(sql).all(...args(p)),
    runAsync: async (sql: string, ...p: unknown[]) =>
      void raw.prepare(sql).run(...args(p)),
    withTransactionAsync: async (fn: () => Promise<void>) => {
      raw.exec("BEGIN");
      try {
        await fn();
        raw.exec("COMMIT");
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return db as typeof db & Parameters<typeof migrate>[0];
}

const LATEST = 5;

// The schema exactly as each released version created it. Never edit these: they stand for phones that already have them.
const HISTORY: { version: number; sql: string }[] = [
  {
    version: 0,
    sql: `CREATE TABLE profile (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
          CREATE TABLE food_log (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, slot TEXT NOT NULL,
            food_id TEXT NOT NULL, qty REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
          CREATE INDEX idx_food_log_date ON food_log(date);`,
  },
  { version: 1, sql: `ALTER TABLE food_log ADD COLUMN batch_id TEXT;` },
  {
    version: 2,
    sql: `CREATE TABLE plan_override (slot TEXT NOT NULL, template_id TEXT NOT NULL, date TEXT NOT NULL DEFAULT '',
            items TEXT NOT NULL, PRIMARY KEY (slot, template_id, date));`,
  },
  {
    version: 3,
    sql: `CREATE TABLE weight_log (date TEXT PRIMARY KEY, kg REAL NOT NULL);
          CREATE TABLE water_log (date TEXT PRIMARY KEY, glasses INTEGER NOT NULL);`,
  },
  {
    version: 4,
    sql: `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  },
  {
    version: 5,
    sql: `CREATE TABLE custom_food (id TEXT PRIMARY KEY, data TEXT NOT NULL);
          CREATE TABLE favourite_food (food_id TEXT PRIMARY KEY);`,
  },
];

// A profile saved before goals existed: no `goal`, no `weeklyGainKg`.
const OLD_PROFILE = {
  name: "Asha",
  sex: "female",
  age: 32,
  heightCm: 160,
  weightKg: 70,
  targetWeightKg: 60,
  activity: "light",
  dietType: "vegetarian",
  weeklyLossKg: 0.5,
};

/** A phone that last ran the app at `version`, with data in every table that existed then. */
function phoneAt(version: number) {
  const db = openDb();
  for (const step of HISTORY) {
    if (step.version > version) break;
    db.raw.exec(step.sql);
  }
  db.raw.exec(`PRAGMA user_version = ${version}`);
  db.raw
    .prepare("INSERT INTO profile (id, data) VALUES (1, ?)")
    .run(JSON.stringify(OLD_PROFILE));
  const log = db.raw.prepare(
    version >= 1
      ? "INSERT INTO food_log (date, slot, food_id, qty, batch_id) VALUES (?, ?, ?, ?, ?)"
      : "INSERT INTO food_log (date, slot, food_id, qty) VALUES (?, ?, ?, ?)",
  );
  const rows: [string, string, string, number][] = [
    ["2026-10-01", "breakfast", "roti", 2],
    ["2026-10-01", "lunch", "dal_tadka", 1.5],
    ["2026-10-02", "dinner", "paneer_bhurji", 1],
  ];
  for (const [d, s, f, q] of rows)
    version >= 1 ? log.run(d, s, f, q, "b1") : log.run(d, s, f, q);
  if (version >= 2)
    db.raw
      .prepare("INSERT INTO plan_override VALUES (?, ?, ?, ?)")
      .run("lunch", "t1", "", JSON.stringify([{ foodId: "roti", qty: 2 }]));
  if (version >= 3) {
    db.raw
      .prepare("INSERT INTO weight_log VALUES (?, ?)")
      .run("2026-10-01", 70);
    db.raw.prepare("INSERT INTO water_log VALUES (?, ?)").run("2026-10-01", 6);
  }
  if (version >= 4)
    db.raw.prepare("INSERT INTO settings VALUES (?, ?)").run("tour_done", "1");
  if (version >= 5) {
    db.raw
      .prepare("INSERT INTO custom_food VALUES (?, ?)")
      .run("c_laddoo", JSON.stringify({ id: "c_laddoo", name: "Laddoo" }));
    db.raw.prepare("INSERT INTO favourite_food VALUES (?)").run("roti");
  }
  return db;
}

const count = (db: ReturnType<typeof openDb>, table: string) =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number })
    .n;

for (const version of [0, 1, 2, 3, 4, 5]) {
  test(`updating from a phone at database version ${version} keeps every row`, async () => {
    const db = phoneAt(version);
    await migrate(db);

    const v = db.raw.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    assert.equal(v.user_version, LATEST);
    assert.equal(count(db, "food_log"), 3, "food log");
    const first = db.raw
      .prepare(
        "SELECT date, slot, food_id, qty FROM food_log ORDER BY id LIMIT 1",
      )
      .get();
    assert.deepEqual(
      { ...first },
      {
        date: "2026-10-01",
        slot: "breakfast",
        food_id: "roti",
        qty: 2,
      },
    );

    // The old profile still opens, now with the goal fields filled in.
    const p = await getProfile(db);
    assert.equal(p?.name, "Asha");
    assert.equal(p?.weightKg, 70);
    assert.equal(p?.goal, "lose");
    assert.equal(p?.weeklyGainKg, 0.25);

    // Data from the versions that already had it survives; newer tables start empty.
    assert.equal(count(db, "plan_override"), version >= 2 ? 1 : 0);
    assert.equal(count(db, "weight_log"), version >= 3 ? 1 : 0);
    assert.equal(count(db, "water_log"), version >= 3 ? 1 : 0);
    assert.equal(await getSetting(db, "tour_done"), version >= 4 ? "1" : null);
    assert.equal(count(db, "custom_food"), version >= 5 ? 1 : 0);
    assert.equal(count(db, "favourite_food"), version >= 5 ? 1 : 0);
  });
}

test("opening the app again after an update changes nothing", async () => {
  const db = phoneAt(3);
  await migrate(db);
  const before = JSON.stringify(await exportBackup(db));
  await migrate(db);
  await migrate(db);
  const after = JSON.parse(JSON.stringify(await exportBackup(db)));
  const was = JSON.parse(before);
  assert.deepEqual({ ...after, exportedAt: 0 }, { ...was, exportedAt: 0 });
});

test("a backup taken before the update restores into the updated app", async () => {
  const old = phoneAt(4);
  await migrate(old);
  const backup = JSON.stringify(await exportBackup(old));
  // Simulate an older backup that never had the newest tables or the goal fields.
  const parsed = JSON.parse(backup);
  delete parsed.tables.custom_food;
  delete parsed.tables.favourite_food;
  delete parsed.profile.goal;

  const fresh = openDb();
  await migrate(fresh);
  await importBackup(fresh, JSON.stringify(parsed));
  assert.equal(count(fresh, "food_log"), 3);
  assert.equal(count(fresh, "custom_food"), 0);
  assert.equal((await getProfile(fresh))?.goal, "lose");
});

test("a new profile field (target date) is optional, so old profiles and backups still load", async () => {
  const db = phoneAt(5);
  await migrate(db);
  assert.equal((await getProfile(db))?.targetDate, undefined);
});

test("a failed restore leaves the existing data untouched", async () => {
  const db = phoneAt(5);
  await migrate(db);
  await assert.rejects(importBackup(db, JSON.stringify({ app: "other" })));
  await assert.rejects(importBackup(db, "not json"));
  assert.equal(count(db, "food_log"), 3);
  assert.equal((await getProfile(db))?.name, "Asha");
});
