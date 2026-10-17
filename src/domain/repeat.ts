import { FOOD_BY_ID } from "./foods.ts";
import { macrosFor } from "./nutrition.ts";
import type { SlotId } from "./types.ts";

type LogLike = { slot: SlotId; food_id: string; qty: number };

export type RepeatOffer = {
  entries: { slot: SlotId; foodId: string; qty: number }[];
  kcal: number;
};

/**
 * What logging "the same again" would add, from an earlier day's logs: one meal when `slot` is given,
 * otherwise every meal. Foods that no longer exist are skipped. Null when there is nothing to repeat.
 */
export function repeatOffer(
  logs: LogLike[],
  slot?: SlotId,
): RepeatOffer | null {
  const entries = logs
    .filter((l) => (!slot || l.slot === slot) && FOOD_BY_ID[l.food_id])
    .map((l) => ({ slot: l.slot, foodId: l.food_id, qty: l.qty }));
  if (!entries.length) return null;
  const kcal = entries.reduce(
    (sum, e) => sum + macrosFor(FOOD_BY_ID[e.foodId], e.qty).kcal,
    0,
  );
  return { entries, kcal };
}
