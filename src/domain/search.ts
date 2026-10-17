import type { Food } from "./types.ts";

/** Words people use for the same food. A search for any of them finds all of them. */
const SYNONYMS: string[][] = [
  ["curd", "dahi", "yogurt", "yoghurt"],
  ["roti", "chapati", "phulka", "chapatti"],
  ["paneer", "panir", "cottage cheese"],
  ["potato", "aloo", "alu"],
  ["chickpea", "chana", "chole", "chhole"],
  ["dal", "daal", "dhal", "lentil"],
  ["buttermilk", "chaas", "chhaas", "chach"],
  ["sabzi", "sabji", "subzi", "sabzee"],
  ["spinach", "palak"],
  ["okra", "bhindi", "ladyfinger", "lady finger"],
  ["cauliflower", "gobi", "gobhi"],
  ["rice", "chawal"],
  ["tea", "chai"],
  ["egg", "anda"],
  ["milk", "doodh"],
  ["poha", "pohe", "flattened rice"],
  ["khichdi", "khichri", "khichadi"],
  ["peanut", "moongphali", "mungfali", "groundnut"],
  ["soya", "soy", "soybean"],
  ["oats", "oatmeal", "porridge"],
  ["chilla", "cheela", "chila"],
  ["idli", "idly"],
  ["dosa", "dosai"],
  ["sambar", "sambhar"],
  ["upma", "uppma"],
];

/**
 * Lowercase, no accents, double letters collapsed and an h after a consonant dropped, so
 * "daal", "dhal" and "dal" (or "chhole" and "chole") all look the same.
 */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/([bcdgjkpst])h/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const GROUPS = SYNONYMS.map((g) => g.map(normalize));

/** The query word plus every normalised synonym of a group it belongs to. */
function variants(word: string): string[] {
  const out = new Set([word]);
  for (const g of GROUPS) if (g.includes(word)) g.forEach((t) => out.add(t));
  return [...out];
}

/** True when every word of the query matches the name, directly or through a synonym. */
export function matchesQuery(name: string, query: string): boolean {
  const n = normalize(name);
  const words = normalize(query).split(" ").filter(Boolean);
  return words.every((w) => variants(w).some((v) => n.includes(v)));
}

/** Foods matching the query; names that start with what was typed come first. */
export function searchFoods(foods: Food[], query: string): Food[] {
  const q = normalize(query);
  if (!q) return foods;
  const hits = foods.filter((f) => matchesQuery(f.name, query));
  const first = (f: Food) => normalize(f.name).startsWith(q);
  return [...hits.filter(first), ...hits.filter((f) => !first(f))];
}
