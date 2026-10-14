import type { MealTemplate, SlotId, TemplateItem } from "./types.ts";

const i = (
  foodId: string,
  qty: number,
  step = qty < 1 ? 0.5 : 1,
): TemplateItem => ({ foodId, qty, step });

function t(id: string, slot: SlotId, ...items: TemplateItem[]): MealTemplate {
  return { id, slot, items };
}

export const TEMPLATES: MealTemplate[] = [
  t("em_almonds", "early_morning", i("almonds", 1)),
  t("em_banana", "early_morning", i("banana", 0.5)),

  t("b_poha", "breakfast", i("poha", 1, 0.5), i("tea_milk", 1)),
  t(
    "b_idli",
    "breakfast",
    i("idli", 3),
    i("sambar", 1, 0.5),
    i("coconut_chutney", 1),
  ),
  t("b_chilla", "breakfast", i("besan_chilla", 2), i("curd", 1, 0.5)),
  t("b_eggs", "breakfast", i("egg_boiled", 2), i("roti", 1), i("tea_milk", 1)),
  t(
    "b_oats",
    "breakfast",
    i("oats", 1, 0.5),
    i("milk_toned", 1, 0.5),
    i("banana", 0.5),
  ),
  t("b_upma", "breakfast", i("upma", 1, 0.5), i("sprouts", 1, 0.5)),

  t(
    "l_dal_roti",
    "lunch",
    i("roti", 2),
    i("dal_tadka", 1, 0.5),
    i("mixed_veg", 1, 0.5),
    i("curd", 1, 0.5),
    i("cucumber_salad", 1),
  ),
  t(
    "l_rajma_rice",
    "lunch",
    i("rice_white", 1, 0.5),
    i("rajma", 1, 0.5),
    i("cucumber_salad", 1),
    i("buttermilk", 1),
  ),
  t(
    "l_palak_paneer",
    "lunch",
    i("roti", 2),
    i("palak_paneer", 1, 0.5),
    i("cucumber_salad", 1),
  ),
  t(
    "l_chicken_rice",
    "lunch",
    i("rice_white", 1, 0.5),
    i("chicken_curry", 1, 0.5),
    i("cucumber_salad", 1),
  ),
  t(
    "l_moong_roti",
    "lunch",
    i("roti", 2),
    i("moong_dal", 1, 0.5),
    i("curd", 1, 0.5),
    i("cucumber_salad", 1),
  ),
  t(
    "l_chole_rice",
    "lunch",
    i("rice_brown", 1, 0.5),
    i("chole", 1, 0.5),
    i("cucumber_salad", 1),
  ),

  t("s_chana", "snack", i("roasted_chana", 1, 0.5), i("tea_milk", 1)),
  t("s_sprouts", "snack", i("sprouts", 1, 0.5), i("buttermilk", 1)),
  t("s_fruit", "snack", i("apple", 1), i("almonds", 1)),

  t(
    "d_moong_roti",
    "dinner",
    i("roti", 2),
    i("moong_dal", 1, 0.5),
    i("mixed_veg", 1, 0.5),
  ),
  t("d_dosa", "dinner", i("dosa", 2), i("sambar", 1, 0.5)),
  t(
    "d_soya",
    "dinner",
    i("roti", 2),
    i("soya_chunks", 1, 0.5),
    i("mixed_veg", 1, 0.5),
  ),
  t(
    "d_fish_rice",
    "dinner",
    i("rice_white", 1, 0.5),
    i("fish_curry", 1, 0.5),
    i("cucumber_salad", 1),
  ),
  t("d_tofu", "dinner", i("roti", 2), i("tofu", 2), i("cucumber_salad", 1)),

  t("bt_milk", "bedtime", i("milk_toned", 0.5)),
];
