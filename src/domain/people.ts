/** One person on this phone. Each person has their own database file, so data never mixes. */
export type Person = { id: string; name: string; dbName: string };
export type People = { active: string; list: Person[] };

/** The first person keeps the original database, so nothing is lost for existing installs. */
export const FIRST_PERSON: Person = {
  id: "p1",
  name: "Me",
  dbName: "thali.db",
};
export const DEFAULT_PEOPLE: People = {
  active: FIRST_PERSON.id,
  list: [FIRST_PERSON],
};

export const MAX_PEOPLE = 8;

function isPerson(x: unknown): x is Person {
  const p = x as Person;
  return (
    !!p &&
    typeof p.id === "string" &&
    /^p[a-z0-9]+$/.test(p.id) &&
    typeof p.name === "string" &&
    typeof p.dbName === "string" &&
    /^thali(_[a-z0-9]+)?\.db$/.test(p.dbName)
  );
}

/** Reads the saved list, falling back to a single default person if it is missing or damaged. */
export function parsePeople(raw: string | null): People {
  try {
    const p = JSON.parse(raw ?? "") as People;
    if (!Array.isArray(p.list) || !p.list.length || !p.list.every(isPerson))
      return DEFAULT_PEOPLE;
    const active = p.list.some((x) => x.id === p.active)
      ? p.active
      : p.list[0].id;
    return { active, list: p.list };
  } catch {
    return DEFAULT_PEOPLE;
  }
}

/** Adds a person and makes them the active one. `salt` only has to differ between calls. */
export function addPerson(
  people: People,
  name: string,
  salt = Date.now().toString(36),
): People {
  if (people.list.length >= MAX_PEOPLE) return people;
  let id = `p${salt}`;
  while (people.list.some((x) => x.id === id)) id += "x";
  const person: Person = {
    id,
    name: name.trim() || "New person",
    dbName: `thali_${id.slice(1)}.db`,
  };
  return { active: id, list: [...people.list, person] };
}

export function switchPerson(people: People, id: string): People {
  return people.list.some((x) => x.id === id)
    ? { ...people, active: id }
    : people;
}

export function renamePerson(people: People, id: string, name: string): People {
  const clean = name.trim();
  if (!clean) return people;
  return {
    ...people,
    list: people.list.map((x) => (x.id === id ? { ...x, name: clean } : x)),
  };
}

/** Removes a person; the last one can't be removed. */
export function removePerson(people: People, id: string): People {
  if (people.list.length <= 1) return people;
  const list = people.list.filter((x) => x.id !== id);
  return { active: people.active === id ? list[0].id : people.active, list };
}

export const activePerson = (people: People): Person =>
  people.list.find((x) => x.id === people.active) ?? people.list[0];

/** The database file a person id always maps to, so a restore lands in the right place. */
export const dbNameFor = (id: string) =>
  id === FIRST_PERSON.id ? FIRST_PERSON.dbName : `thali_${id.slice(1)}.db`;

/** Makes sure a person from a cloud backup exists here; returns null for an id that isn't valid. */
export function ensurePerson(
  people: People,
  id: string,
  name: string,
): People | null {
  const person: Person = {
    id,
    name: name.trim() || "Person",
    dbName: dbNameFor(id),
  };
  if (!isPerson(person)) return null;
  if (people.list.some((x) => x.id === id))
    return renamePerson(people, id, person.name);
  if (people.list.length >= MAX_PEOPLE) return null;
  return { ...people, list: [...people.list, person] };
}
