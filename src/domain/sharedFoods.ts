import type { Food } from "./types.ts";

/** Shared foods get ids like "cf_3f2c…", so they never clash with built-in or own foods. */
export const SHARED_PREFIX = "cf_";

export const sharedId = (uuid: string) => `${SHARED_PREFIX}${uuid}`;
export const uuidOfShared = (id: string) =>
  id.startsWith(SHARED_PREFIX) ? id.slice(SHARED_PREFIX.length) : null;

/** A row of the cloud's approved_foods view. */
export type SharedFoodRow = {
  id: string;
  name: string;
  unit: string;
  grams: number | string;
  kcal: number | string;
  protein: number | string;
  carbs: number | string;
  fat: number | string;
  fiber: number | string;
  tags: Food["tags"] | null;
};

const n = (v: number | string) => Number(v);

export function foodFromRow(r: SharedFoodRow): Food {
  return {
    id: sharedId(r.id),
    name: r.name,
    per100g: {
      kcal: n(r.kcal),
      protein: n(r.protein),
      carbs: n(r.carbs),
      fat: n(r.fat),
      fiber: n(r.fiber),
    },
    measure: { unit: r.unit, grams: n(r.grams) },
    tags: r.tags ?? {},
    verified: true,
    community: true,
  };
}

export type SubmissionStatus = "pending" | "approved" | "rejected";

/** What the cloud says happened to a food this account sent. */
export type SubmissionInfo = {
  status: SubmissionStatus;
  /** The shared food that replaces the own one, once approved. */
  communityId: string | null;
  note: string;
  changedByAdmin: boolean;
};

/** Changes whenever anything the admin would check changes, so edits are sent again. */
export const foodFingerprint = (f: Food) =>
  JSON.stringify([f.name, f.measure, f.per100g, f.tags]);

export type Chip = { text: string; tone: "good" | "wait" | "info" };

/** The short status shown next to one of the person's own foods. */
export function shareChip(
  info: SubmissionInfo | undefined,
  signedIn: boolean,
): Chip {
  if (!info)
    return signedIn
      ? { text: "Sending to be checked…", tone: "wait" }
      : { text: "Shared after you back up", tone: "wait" };
  if (info.status === "pending") return { text: "In review", tone: "wait" };
  if (info.status === "approved")
    return {
      text: info.changedByAdmin ? "Checked and corrected ✓" : "Checked ✓",
      tone: "good",
    };
  return { text: "Kept private", tone: "info" };
}
