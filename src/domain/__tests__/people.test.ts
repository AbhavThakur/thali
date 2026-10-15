import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activePerson,
  addPerson,
  DEFAULT_PEOPLE,
  dbNameFor,
  ensurePerson,
  MAX_PEOPLE,
  parsePeople,
  removePerson,
  renamePerson,
  switchPerson,
} from "../people.ts";

test("a fresh install has one person on the original database", () => {
  assert.deepEqual(parsePeople(null), DEFAULT_PEOPLE);
  assert.equal(activePerson(DEFAULT_PEOPLE).dbName, "thali.db");
});

test("adding a person gives them their own database and makes them active", () => {
  const p = addPerson(DEFAULT_PEOPLE, "  Asha ", "k1");
  assert.equal(p.list.length, 2);
  assert.equal(activePerson(p).name, "Asha");
  assert.equal(activePerson(p).dbName, "thali_k1.db");
  const q = addPerson(p, "Ravi", "k1");
  assert.notEqual(activePerson(q).id, "pk1", "ids never collide");
  assert.notEqual(activePerson(q).dbName, "thali_k1.db");
});

test("the list is capped", () => {
  let p = DEFAULT_PEOPLE;
  for (let i = 0; i < MAX_PEOPLE + 3; i++) p = addPerson(p, `P${i}`, String(i));
  assert.equal(p.list.length, MAX_PEOPLE);
});

test("switch, rename and remove", () => {
  let p = addPerson(DEFAULT_PEOPLE, "Asha", "a");
  p = switchPerson(p, "p1");
  assert.equal(p.active, "p1");
  assert.equal(switchPerson(p, "nope").active, "p1");
  p = renamePerson(p, "pa", "Asha K");
  assert.equal(p.list[1].name, "Asha K");
  assert.equal(renamePerson(p, "pa", "   ").list[1].name, "Asha K");
  p = switchPerson(p, "pa");
  p = removePerson(p, "pa");
  assert.equal(p.list.length, 1);
  assert.equal(
    p.active,
    "p1",
    "removing the active person falls back to the first",
  );
  assert.equal(removePerson(p, "p1").list.length, 1, "the last person stays");
});

test("restoring from the cloud adds missing people with the right database", () => {
  const added = ensurePerson(DEFAULT_PEOPLE, "pk2", " Ravi ");
  assert.equal(added?.list[1].dbName, "thali_k2.db");
  assert.equal(added?.list[1].name, "Ravi");
  assert.equal(added?.active, "p1", "the active person doesn't change");
  assert.equal(dbNameFor("p1"), "thali.db");
  const again = ensurePerson(added!, "pk2", "Ravi K");
  assert.equal(again?.list.length, 2);
  assert.equal(again?.list[1].name, "Ravi K");
  assert.equal(ensurePerson(DEFAULT_PEOPLE, "../x", "Bad"), null);
});

test("damaged saved data falls back to the default", () => {
  assert.deepEqual(parsePeople("{oops"), DEFAULT_PEOPLE);
  assert.deepEqual(
    parsePeople(JSON.stringify({ active: "x", list: [] })),
    DEFAULT_PEOPLE,
  );
  assert.deepEqual(
    parsePeople(
      JSON.stringify({
        active: "p1",
        list: [{ id: "p1", name: "A", dbName: "../evil.db" }],
      }),
    ),
    DEFAULT_PEOPLE,
    "database names are checked",
  );
  const ok = parsePeople(
    JSON.stringify({
      active: "gone",
      list: [{ id: "p9", name: "A", dbName: "thali_9.db" }],
    }),
  );
  assert.equal(ok.active, "p9");
});
