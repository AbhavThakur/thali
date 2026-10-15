import { FOOD_BY_ID } from "./foods.ts";
import { isAllowed, macrosFor, sumMacros } from "./nutrition.ts";
import { TEMPLATES } from "./templates.ts";
import type {
  DietType,
  MealOption,
  MealTemplate,
  PlanItemInput,
  PlanOverride,
  SlotId,
  SlotPlan,
} from "./types.ts";

export const SLOTS: { id: SlotId; label: string; share: number }[] = [
  { id: "early_morning", label: "On waking", share: 0.05 },
  { id: "breakfast", label: "Breakfast", share: 0.25 },
  { id: "lunch", label: "Lunch", share: 0.3 },
  { id: "snack", label: "Snack", share: 0.12 },
  { id: "dinner", label: "Dinner", share: 0.25 },
  { id: "bedtime", label: "Bedtime", share: 0.03 },
];

const MIN_FACTOR = 0.5;
const MAX_FACTOR = 3;

/** Meals that absorb what the small slots or portion steps can't cover. */
const FLEX_SLOTS: SlotId[] = ["breakfast", "lunch", "dinner"];
/** Options per meal that the day is balanced over, whatever number is shown. */
const BALANCE_OPTIONS = 3;

/** Days since epoch for a local YYYY-MM-DD date; feeds `buildDayPlan`'s rotation. */
export const dayNumber = (date: string) =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

const roundToStep = (q: number, step: number) =>
  Math.max(step, Math.round(q / step) * step);

const kcalOf = (tpl: MealTemplate, qtys: number[]) =>
  qtys.reduce(
    (sum, q, idx) => sum + macrosFor(FOOD_BY_ID[tpl.items[idx].foodId], q).kcal,
    0,
  );

export function scaleTemplate(
  tpl: MealTemplate,
  targetKcal: number,
): MealOption {
  const base = kcalOf(
    tpl,
    tpl.items.map((it) => it.qty),
  );
  const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, targetKcal / base));
  const qtys = tpl.items.map((it) => roundToStep(it.qty * factor, it.step));

  // Rounding to household steps drifts; nudge one item by one step while it gets closer.
  for (let guard = 0; guard < 20; guard++) {
    const err = Math.abs(kcalOf(tpl, qtys) - targetKcal);
    let best: { idx: number; q: number; err: number } | null = null;
    tpl.items.forEach((it, idx) => {
      for (const q of [qtys[idx] - it.step, qtys[idx] + it.step]) {
        if (q < it.step || q < it.qty * MIN_FACTOR || q > it.qty * MAX_FACTOR)
          continue;
        const trial = qtys.map((x, j) => (j === idx ? q : x));
        const e = Math.abs(kcalOf(tpl, trial) - targetKcal);
        if (e < err && (!best || e < best.err)) best = { idx, q, err: e };
      }
    });
    if (!best) break;
    const { idx, q } = best as { idx: number; q: number };
    qtys[idx] = q;
  }

  const items = tpl.items.map((it, idx) => {
    const food = FOOD_BY_ID[it.foodId];
    return { food, qty: qtys[idx], macros: macrosFor(food, qtys[idx]) };
  });
  return {
    templateId: tpl.id,
    items,
    totals: sumMacros(items.map((x) => x.macros)),
  };
}

export function allowedTemplates(slot: SlotId, diet: DietType): MealTemplate[] {
  return TEMPLATES.filter(
    (t) =>
      t.slot === slot &&
      t.items.every((it) => isAllowed(FOOD_BY_ID[it.foodId], diet)),
  );
}

/** Max rotated templates that compete for the top spots when protein-first is on. */
const PROTEIN_WINDOW = 6;

/**
 * `dayIndex` rotates which templates come first so consecutive days differ.
 * With `proteinFirst`, the next few rotated templates are ranked by protein per kcal,
 * which lifts protein (vegetarian plans especially) while keeping day-to-day variety.
 *
 * Portion steps and empty slots make each meal land a little off its share, so the
 * shortfall or excess is moved onto breakfast, lunch and dinner until the average pick
 * adds up to `targetKcal`. The result doesn't depend on `maxOptions`.
 */
export function buildDayPlan(
  targetKcal: number,
  diet: DietType,
  dayIndex = 0,
  maxOptions = 3,
  proteinFirst = false,
): SlotPlan[] {
  const build = (slotKcal: Map<SlotId, number>): SlotPlan[] =>
    SLOTS.map(({ id, label }) => {
      const kcal = slotKcal.get(id) ?? 0;
      const pool = allowedTemplates(id, diet);
      const offset = pool.length ? dayIndex % pool.length : 0;
      const rotated = [...pool.slice(offset), ...pool.slice(0, offset)];
      const scaled = proteinFirst
        ? rotated
            // Half the pool at most, or small pools would pick the same meal every day.
            .slice(0, Math.min(PROTEIN_WINDOW, Math.ceil(pool.length / 2)))
            .map((t) => scaleTemplate(t, kcal))
            .sort(
              (a, b) =>
                b.totals.protein / (b.totals.kcal || 1) -
                a.totals.protein / (a.totals.kcal || 1),
            )
        : rotated.slice(0, BALANCE_OPTIONS).map((t) => scaleTemplate(t, kcal));
      return {
        slot: id,
        label,
        targetKcal: Math.round(kcal),
        options: scaled.slice(0, BALANCE_OPTIONS),
      };
    });

  const slotKcal = new Map(SLOTS.map((s) => [s.id, targetKcal * s.share]));
  let plan = build(slotKcal);
  for (let pass = 0; pass < 4; pass++) {
    const average = plan.reduce(
      (sum, s) =>
        sum +
        (s.options.length
          ? s.options.reduce((a, o) => a + o.totals.kcal, 0) / s.options.length
          : 0),
      0,
    );
    const gap = targetKcal - average;
    if (Math.abs(gap) <= targetKcal * 0.005) break;
    const flex = plan.filter(
      (s) => FLEX_SLOTS.includes(s.slot) && s.options.length,
    );
    const flexShare = flex.reduce(
      (a, s) => a + (SLOTS.find((x) => x.id === s.slot)?.share ?? 0),
      0,
    );
    if (!flexShare) break;
    for (const s of flex) {
      const share = SLOTS.find((x) => x.id === s.slot)?.share ?? 0;
      slotKcal.set(
        s.slot,
        Math.max(0, (slotKcal.get(s.slot) ?? 0) + (gap * share) / flexShare),
      );
    }
    plan = build(slotKcal);
  }
  return plan.map((s) => ({ ...s, options: s.options.slice(0, maxOptions) }));
}

export type GroceryItem = {
  foodId: string;
  name: string;
  qty: number;
  grams: number;
  unit: string;
};

/** Totals the first option of every meal across the given days. */
export function groceryList(days: SlotPlan[][]): GroceryItem[] {
  const byId = new Map<string, GroceryItem>();
  for (const day of days)
    for (const slot of day) {
      const opt = slot.options[0];
      if (!opt) continue;
      for (const it of opt.items) {
        const g = byId.get(it.food.id) ?? {
          foodId: it.food.id,
          name: it.food.name,
          qty: 0,
          grams: 0,
          unit: it.food.measure.unit,
        };
        g.qty += it.qty;
        g.grams += it.qty * it.food.measure.grams;
        byId.set(it.food.id, g);
      }
    }
  return [...byId.values()].sort((a, b) => b.grams - a.grams);
}

/** Builds an option from raw items; unknown foods and zero quantities are dropped. */
export function optionFromItems(
  templateId: string,
  items: PlanItemInput[],
): MealOption {
  const planned = items
    .filter((it) => FOOD_BY_ID[it.foodId] && it.qty > 0)
    .map((it) => {
      const food = FOOD_BY_ID[it.foodId];
      return { food, qty: it.qty, macros: macrosFor(food, it.qty) };
    });
  return {
    templateId,
    items: planned,
    totals: sumMacros(planned.map((x) => x.macros)),
  };
}

/** Replaces edited options; an edit for a specific date beats an every-day edit. */
export function applyOverrides(
  plan: SlotPlan[],
  overrides: PlanOverride[],
): SlotPlan[] {
  return plan.map((s) => ({
    ...s,
    options: s.options.map((o) => {
      const mine = overrides.filter(
        (x) => x.slot === s.slot && x.templateId === o.templateId,
      );
      const pick = mine.find((x) => x.date !== "") ?? mine[0];
      return pick
        ? { ...optionFromItems(o.templateId, pick.items), edited: true }
        : o;
    }),
  }));
}
