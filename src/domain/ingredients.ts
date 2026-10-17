import { macroKcal } from "./customFood.ts";
import type { Food } from "./types.ts";

type Tags = Food["tags"];

/**
 * Raw ingredients for the recipe builder. They are looked up like any food (so saved recipes keep working)
 * but are not offered in food search. Values are approximate, per 100 g raw: protein, available carbs, fat, fiber.
 * Carbs are stored with fiber included, like every other food, and calories come from the same formula the
 * shared-food review uses, so a recipe's calories always agree with its macros.
 */
function ing(
  id: string,
  name: string,
  [protein, availCarbs, fat, fiber]: [number, number, number, number],
  unit: string,
  grams: number,
  tags: Tags = {},
): Food {
  const carbs = availCarbs + fiber;
  return {
    id: `i_${id}`,
    name,
    per100g: {
      kcal: Math.round(macroKcal(protein, carbs, fat, fiber)),
      protein,
      carbs,
      fat,
      fiber,
    },
    measure: { unit, grams },
    tags,
    verified: false,
  };
}

const ROOT: Tags = { rootVeg: true };
const MEAT: Tags = { meat: true };

export const INGREDIENTS: Food[] = [
  // Grains and flours
  ing("rice_raw", "Rice, raw (white)", [6.8, 77.5, 0.5, 0.5], "katori", 125),
  ing("atta", "Whole wheat flour (atta)", [10.6, 64, 1.5, 11.4], "katori", 85),
  ing("besan", "Besan (gram flour)", [22, 46, 6.7, 11], "katori", 80),
  ing("rava", "Rava / sooji", [10.4, 74, 0.8, 2.5], "katori", 110),
  ing(
    "poha_raw",
    "Poha (flattened rice), dry",
    [6.6, 76, 1.2, 2],
    "katori",
    60,
  ),
  // Dals and pulses, raw
  ing("toor_dal", "Toor dal, raw", [22.3, 57.6, 1.7, 15.5], "katori", 120),
  ing(
    "moong_dal_raw",
    "Moong dal (split), raw",
    [24, 54, 1.2, 8],
    "katori",
    120,
  ),
  ing("masoor_dal", "Masoor dal, raw", [25, 55, 0.7, 11], "katori", 120),
  ing("chana_dal", "Chana dal, raw", [21, 54, 5.3, 12], "katori", 120),
  ing("urad_dal", "Urad dal, raw", [24, 47, 1.6, 12], "katori", 120),
  ing("rajma_raw", "Rajma, raw", [22.9, 45, 1.3, 15], "katori", 110),
  ing("chickpea_raw", "Kabuli chana, raw", [19, 46, 6, 12], "katori", 110),
  // Vegetables
  ing("onion", "Onion", [1.2, 9.5, 0.1, 0.6], "onion", 100, ROOT),
  ing("tomato", "Tomato", [0.9, 3.5, 0.2, 0.8], "tomato", 80),
  ing("potato", "Potato", [1.6, 20, 0.1, 1.7], "potato", 100, ROOT),
  ing("carrot", "Carrot", [0.9, 9, 0.2, 1.2], "carrot", 70, ROOT),
  ing("garlic", "Garlic", [6.3, 28, 0.5, 2], "tsp (chopped)", 5, ROOT),
  ing(
    "cauliflower",
    "Cauliflower",
    [2.6, 3.3, 0.4, 1.2],
    "katori (chopped)",
    100,
  ),
  ing("cabbage", "Cabbage", [1.8, 4, 0.1, 1], "katori (chopped)", 80),
  ing("spinach", "Spinach (palak)", [2, 2, 0.7, 0.6], "katori (chopped)", 60),
  ing("green_peas", "Green peas", [7.2, 11, 0.1, 5.1], "katori", 100),
  ing(
    "brinjal",
    "Brinjal (baingan)",
    [1.4, 3.5, 0.3, 2.5],
    "katori (chopped)",
    100,
  ),
  ing("bhindi", "Okra (bhindi)", [1.9, 4, 0.2, 3.2], "katori (chopped)", 100),
  ing("capsicum", "Capsicum", [1.3, 3, 0.3, 1], "katori (chopped)", 100),
  ing("beans", "French beans", [1.7, 3.5, 0.1, 2], "katori (chopped)", 100),
  ing(
    "lauki",
    "Lauki (bottle gourd)",
    [0.2, 2.3, 0.1, 0.6],
    "katori (chopped)",
    100,
  ),
  // Fats, sweeteners, nuts
  ing("oil", "Cooking oil", [0, 0, 100, 0], "tsp", 5),
  ing("butter", "Butter", [0.5, 0.1, 81, 0], "tsp", 5, { dairy: true }),
  ing("sugar", "Sugar", [0, 100, 0, 0], "tsp", 4),
  ing("jaggery", "Jaggery (gur)", [0.4, 95, 0.1, 0], "tsp", 6),
  ing("coconut", "Fresh coconut, grated", [4.5, 4, 41, 7], "tbsp", 10),
  ing("cashew", "Cashew nuts", [21, 19, 46, 3], "serving (10 pcs)", 15),
  // Meat and fish, raw
  ing(
    "chicken_raw",
    "Chicken, boneless, raw",
    [22, 0, 3, 0],
    "serving (100 g)",
    100,
    MEAT,
  ),
  ing(
    "fish_raw",
    "Fish (rohu), raw",
    [17, 0, 2, 0],
    "serving (100 g)",
    100,
    MEAT,
  ),
  ing(
    "mutton_raw",
    "Mutton, raw",
    [18.5, 0, 13, 0],
    "serving (100 g)",
    100,
    MEAT,
  ),
];
