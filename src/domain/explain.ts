import { calorieTarget, bmr, macroTargets } from "./energy.ts";
import { describeServing, gramsFor, macrosFor } from "./nutrition.ts";
import { SLOTS } from "./plan.ts";
import type { Food, Macros, Profile, SlotId } from "./types.ts";

const kcal = (n: number) => `${Math.round(n).toLocaleString("en-IN")} kcal`;
const grams = (n: number) => `${Math.round(n)} g`;

/** Plain-language steps from a food's stored values to the calories shown for a quantity. */
export function explainFood(food: Food, qty: number): string[] {
  if (food.quick)
    return ["You typed these numbers yourself, so they are used as they are."];
  const total = macrosFor(food, qty);
  const g = gramsFor(food, qty);
  return [
    `100 g of ${food.name} has about ${kcal(food.per100g.kcal)}.`,
    `${describeServing(food, qty)} is ${grams(g)}.`,
    `${grams(g)} × ${Math.round(food.per100g.kcal)} kcal per 100 g = ${kcal(total.kcal)}.`,
  ];
}

export type DayImpact = {
  /** What this food does to the day's calories. */
  kcal: string;
  protein: string;
  /** True when the day goes over its calorie target. */
  over: boolean;
};

/** What adding `added` to `consumed` means against the day's targets. */
export function dayImpact(
  consumed: Macros,
  target: Macros,
  added: Macros,
): DayImpact {
  const left = target.kcal - consumed.kcal - added.kcal;
  const share = target.kcal ? Math.round((added.kcal / target.kcal) * 100) : 0;
  const proteinNow = consumed.protein + added.protein;
  return {
    kcal:
      left >= 0
        ? `${share}% of today's ${kcal(target.kcal)}. ${kcal(left)} left after this.`
        : `${share}% of today's ${kcal(target.kcal)}. ${kcal(-left)} over the target.`,
    protein: `Protein ${grams(proteinNow)} of ${grams(target.protein)} today.`,
    over: left < 0,
  };
}

export type HelpSection = { title: string; body: string };

/** The "how is this worked out" text for a meal card, using this person's own numbers. */
export function explainMeal(profile: Profile, slotId: SlotId): HelpSection[] {
  const t = calorieTarget(profile);
  const slot = SLOTS.find((s) => s.id === slotId);
  const macros = macroTargets(profile, t.kcal);
  const share = slot?.share ?? 0;

  const goalLine = t.gainBlocked
    ? `Your BMI is already high, so we hold you at maintenance instead of adding weight.`
    : t.atGoal
      ? `Your goal is to stay where you are, so you eat at maintenance.`
      : t.deficit
        ? `To lose weight at your pace we take ${kcal(t.deficit)} off every day${t.clampedToFloor ? ", but never below the safe minimum" : ""}.`
        : `To gain weight at your pace we add ${kcal(t.surplus)} every day.`;

  return [
    {
      title: `Your day: ${kcal(t.kcal)}`,
      body: `Your body at rest burns about ${kcal(bmr(profile))} (Mifflin-St Jeor, from your age, height and weight). Your activity level takes that to ${kcal(t.tdee)} a day. ${goalLine}`,
    },
    {
      title: `${slot?.label ?? "This meal"}: ${kcal(t.kcal * share)}`,
      body: `The day is split by meal: on waking 5%, breakfast 25%, lunch 30%, snack 12%, dinner 25%, bedtime 3%. ${slot?.label ?? "This meal"} gets ${Math.round(share * 100)}% of ${kcal(t.kcal)}. It is a guide, so a bigger lunch and a lighter dinner is fine.`,
    },
    {
      title: "Where a food's calories come from",
      body: "Every food has calories per 100 g. We scale that by the weight of what you ate: roti, katori and glass are turned into grams first. Calories also add up from nutrients: 4 per gram of protein or carbs and 9 per gram of fat.",
    },
    {
      title: `Your protein: ${grams(macros.protein)} a day`,
      body: `Protein is set by your goal and body weight, carbs and fat fill the rest, and fiber is at least 25 g. Food values are approximate until checked against Indian food tables, so use them as a guide, not a lab result.`,
    },
    {
      title: "Stars",
      body: "Log every meal, land within 10% of your calories, and hit your protein. Eating less never earns a star.",
    },
  ];
}
