import { FOOD_BY_ID } from "./foods.ts";
import { isAllowed, macrosFor, sumMacros } from "./nutrition.ts";
import { TEMPLATES } from "./templates.ts";
import type {
  DietType,
  MealOption,
  MealTemplate,
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
const MAX_FACTOR = 2.5;

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

/** `dayIndex` rotates which templates come first so consecutive days differ. */
export function buildDayPlan(
  targetKcal: number,
  diet: DietType,
  dayIndex = 0,
  maxOptions = 3,
): SlotPlan[] {
  return SLOTS.map(({ id, label, share }) => {
    const slotKcal = Math.round(targetKcal * share);
    const pool = allowedTemplates(id, diet);
    const offset = pool.length ? dayIndex % pool.length : 0;
    const rotated = [...pool.slice(offset), ...pool.slice(0, offset)];
    return {
      slot: id,
      label,
      targetKcal: slotKcal,
      options: rotated
        .slice(0, maxOptions)
        .map((t) => scaleTemplate(t, slotKcal)),
    };
  });
}
