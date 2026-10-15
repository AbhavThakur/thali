const CM_PER_INCH = 2.54;

/** 160 cm is 5 ft 3 in. Inches are rounded, so the result is always 0 to 11. */
export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const total = Math.round(cm / CM_PER_INCH);
  return { ft: Math.floor(total / 12), inch: total % 12 };
}

/** Feet and inches to whole centimetres; inches past 11 carry into feet (5 ft 14 in is 6 ft 2 in). */
export function ftInToCm(ft: number, inch: number): number {
  return Math.round((ft * 12 + inch) * CM_PER_INCH);
}
