import { INGREDIENTS } from "./ingredients.ts";
import type { Food } from "./types.ts";

type Tags = Food["tags"];

// Approximate home-style values per 100 g; all verified:false until checked against IFCT 2017.
// Household measures are volume-based: a katori holds about 150 ml, so loose foods weigh less
// than dense ones (cooked rice is about 110 g, dal or curry about 150 g).
function food(
  id: string,
  name: string,
  [kcal, protein, carbs, fat, fiber]: [number, number, number, number, number],
  unit: string,
  grams: number,
  tags: Tags = {},
): Food {
  return {
    id,
    name,
    per100g: { kcal, protein, carbs, fat, fiber },
    measure: { unit, grams },
    tags,
    verified: false,
  };
}

const ONION_GARLIC: Tags = { rootVeg: true };

export const FOODS: Food[] = [
  // Grains & breads
  food("roti", "Whole wheat roti (phulka)", [264, 9.6, 50, 3.5, 8], "roti", 40),
  food(
    "rice_white",
    "Steamed white rice",
    [130, 2.7, 28, 0.3, 0.4],
    "katori",
    110,
  ),
  food(
    "rice_brown",
    "Steamed brown rice",
    [112, 2.3, 23.5, 0.8, 1.8],
    "katori",
    110,
  ),
  food(
    "oats",
    "Rolled oats (dry)",
    [379, 13, 68, 6.5, 10],
    "serving (40 g)",
    40,
  ),
  food(
    "poha",
    "Vegetable poha",
    [130, 2.5, 23, 3.5, 1.5],
    "katori",
    150,
    ONION_GARLIC,
  ),
  food(
    "upma",
    "Rava upma",
    [130, 3.5, 20, 4, 1.5],
    "katori",
    150,
    ONION_GARLIC,
  ),
  food("idli", "Idli", [130, 4, 27, 0.4, 1.5], "idli", 40),
  food("dosa", "Plain dosa", [200, 4.5, 30, 7, 1.5], "dosa", 70),
  food(
    "besan_chilla",
    "Besan chilla",
    [180, 9, 20, 7, 4],
    "chilla",
    60,
    ONION_GARLIC,
  ),
  food("paratha", "Plain paratha", [320, 7.5, 45, 12, 4], "paratha", 60),
  food("khichdi", "Moong dal khichdi", [105, 4, 17, 2.5, 1.5], "katori", 150),
  food(
    "veg_pulao",
    "Vegetable pulao",
    [140, 3, 23, 4, 1.5],
    "katori",
    150,
    ONION_GARLIC,
  ),

  // Dals & curries
  food(
    "dal_tadka",
    "Dal tadka (toor)",
    [105, 5.5, 13, 3.5, 3],
    "katori",
    150,
    ONION_GARLIC,
  ),
  food("moong_dal", "Moong dal (plain)", [85, 6, 12, 1.5, 2.5], "katori", 150),
  food(
    "rajma",
    "Rajma curry",
    [140, 6, 18, 4.5, 5],
    "katori",
    150,
    ONION_GARLIC,
  ),
  food(
    "chole",
    "Chole (chickpea curry)",
    [150, 6.5, 20, 5, 6],
    "katori",
    150,
    ONION_GARLIC,
  ),
  food("sambar", "Sambar", [65, 3, 9, 2, 2.5], "katori", 150, ONION_GARLIC),
  food(
    "mixed_veg",
    "Mixed veg sabzi (dry)",
    [90, 2.5, 9, 5, 3],
    "katori",
    100,
    ONION_GARLIC,
  ),
  food(
    "aloo_sabzi",
    "Aloo sabzi",
    [120, 2, 15, 6, 2],
    "katori",
    100,
    ONION_GARLIC,
  ),
  food(
    "jain_sabzi",
    "Veg sabzi (no onion, garlic or potato)",
    [85, 2.5, 8, 5, 3],
    "katori",
    100,
  ),
  food("palak_paneer", "Palak paneer", [165, 7.5, 6, 12.5, 2], "katori", 150, {
    dairy: true,
    rootVeg: true,
  }),
  food(
    "soya_chunks",
    "Soya chunks (dry weight)",
    [345, 52, 33, 0.5, 13],
    "serving (30 g)",
    30,
  ),
  food("tofu", "Tofu (firm)", [144, 17, 3, 8.7, 2], "serving (50 g)", 50),
  food(
    "chicken_curry",
    "Chicken curry (home-style)",
    [150, 15, 4, 8, 1],
    "katori",
    150,
    { meat: true, rootVeg: true },
  ),
  food("fish_curry", "Fish curry", [130, 14, 4, 6.5, 0.5], "katori", 150, {
    meat: true,
    rootVeg: true,
  }),
  food("egg_boiled", "Boiled egg", [155, 12.6, 1.1, 10.6, 0], "egg", 50, {
    egg: true,
  }),
  food("egg_bhurji", "Egg bhurji", [170, 11, 3, 12.5, 0.5], "katori", 100, {
    egg: true,
    rootVeg: true,
  }),
  food(
    "chicken_breast",
    "Grilled chicken breast",
    [165, 31, 0, 3.6, 0],
    "serving (100 g)",
    100,
    { meat: true },
  ),

  // Dairy
  food("paneer", "Paneer", [265, 18, 3.5, 20.5, 0], "serving (50 g)", 50, {
    dairy: true,
  }),
  food("curd", "Curd (dahi)", [61, 3.5, 4.7, 3.3, 0], "katori", 100, {
    dairy: true,
  }),
  food("milk_toned", "Toned milk", [58, 3.1, 4.7, 3, 0], "glass", 200, {
    dairy: true,
  }),
  food("buttermilk", "Buttermilk (chaas)", [25, 1.5, 2, 1, 0], "glass", 200, {
    dairy: true,
  }),
  food("tea_milk", "Tea with milk & sugar", [40, 1.2, 6, 1.2, 0], "cup", 150, {
    dairy: true,
  }),
  food("ghee", "Ghee", [900, 0, 0, 100, 0], "tsp", 5, { dairy: true }),
  food(
    "soy_milk",
    "Soy milk (unsweetened)",
    [33, 2.9, 1.7, 1.6, 0.4],
    "glass",
    200,
  ),

  // Snacks, fruit, sides
  food(
    "roasted_chana",
    "Roasted chana",
    [370, 21, 58, 6, 17],
    "handful (30 g)",
    30,
  ),
  food("sprouts", "Moong sprouts", [30, 3, 6, 0.2, 1.8], "katori", 100),
  food("almonds", "Almonds", [579, 21, 22, 50, 12.5], "serving (10 pcs)", 12),
  food(
    "peanuts",
    "Roasted peanuts",
    [585, 24, 21, 49.5, 8],
    "handful (25 g)",
    25,
  ),
  food("peanut_butter", "Peanut butter", [588, 25, 20, 50, 6], "tbsp", 16),
  food("makhana", "Roasted makhana", [350, 10, 76, 0.5, 14], "bowl (25 g)", 25),
  food(
    "dates",
    "Dates (khajoor)",
    [277, 1.8, 75, 0.2, 6.7],
    "serving (2 dates)",
    16,
  ),
  food(
    "chana_salad",
    "Boiled chickpea salad",
    [164, 8.9, 27, 2.6, 7.6],
    "katori",
    100,
  ),
  food("guava", "Guava", [68, 2.6, 14, 1, 5.4], "guava", 100),
  food("papaya", "Papaya", [43, 0.5, 11, 0.3, 1.7], "katori", 150),
  food("banana", "Banana", [89, 1.1, 23, 0.3, 2.6], "banana", 100),
  food("apple", "Apple", [52, 0.3, 14, 0.2, 2.4], "apple", 180),
  food(
    "cucumber_salad",
    "Cucumber salad",
    [15, 0.7, 3.6, 0.1, 0.5],
    "katori",
    100,
  ),
  food(
    "coconut_chutney",
    "Coconut chutney",
    [200, 2.5, 8, 18, 4],
    "serving (30 g)",
    30,
  ),
];

export const FOOD_BY_ID: Record<string, Food> = Object.fromEntries(
  [...FOODS, ...INGREDIENTS].map((f) => [f.id, f]),
);

let customFoods: Food[] = [];
let communityFoods: Food[] = [];
/** Own foods that were checked and shared: local id -> shared food id. */
let aliases: Record<string, string> = {};

/** Puts every layer into the lookup: built-in, then own foods, then shared foods, then swaps for checked copies. */
function rebuildLookup(previousIds: string[]) {
  for (const id of previousIds) delete FOOD_BY_ID[id];
  for (const f of FOODS) FOOD_BY_ID[f.id] = f;
  for (const f of INGREDIENTS) FOOD_BY_ID[f.id] = f;
  for (const f of customFoods) FOOD_BY_ID[f.id] = f;
  for (const f of communityFoods) FOOD_BY_ID[f.id] = f;
  for (const [local, shared] of Object.entries(aliases))
    if (FOOD_BY_ID[shared] && FOOD_BY_ID[shared].community)
      FOOD_BY_ID[local] = FOOD_BY_ID[shared];
}

const registeredIds = () => [
  ...customFoods.map((f) => f.id),
  ...communityFoods.map((f) => f.id),
];

/** The user's own foods, always flagged `custom`. Replaces whatever was registered before. */
export function registerCustomFoods(list: Food[]) {
  const before = registeredIds();
  customFoods = list.map((f) => ({ ...f, custom: true, verified: false }));
  rebuildLookup(before);
}

/**
 * The shared, admin-checked foods. `own` maps a person's own food ids to the shared food that replaced them,
 * so old logs show the corrected values.
 */
export function registerCommunityFoods(
  list: Food[],
  own: Record<string, string> = {},
) {
  const before = registeredIds();
  communityFoods = list.map((f) => ({
    ...f,
    community: true,
    custom: false,
    verified: true,
  }));
  aliases = { ...own };
  rebuildLookup(before);
}

/** True when an own food has been replaced by its checked, shared version. */
export const isReplacedByShared = (id: string) =>
  !!aliases[id] && !!FOOD_BY_ID[aliases[id]]?.community;

/** Built-in foods, the user's own (unless a checked copy replaced them) and the shared foods. Quick entries are never listed. */
export function allFoods(): Food[] {
  return [
    ...FOODS,
    ...customFoods.filter((f) => !f.quick && !isReplacedByShared(f.id)),
    ...communityFoods,
  ];
}
