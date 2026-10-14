import type { Food } from "./types.ts";

type Tags = Food["tags"];

// Approximate home-style values per 100 g; all verified:false until checked against IFCT 2017.
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
    150,
  ),
  food(
    "rice_brown",
    "Steamed brown rice",
    [112, 2.3, 23.5, 0.8, 1.8],
    "katori",
    150,
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
  FOODS.map((f) => [f.id, f]),
);
