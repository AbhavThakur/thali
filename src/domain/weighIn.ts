/** A weight typed by the person, rounded to 0.1 kg; null when it can't be right. */
export function parseWeight(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  return n >= 30 && n <= 250 ? Math.round(n * 10) / 10 : null;
}

export type LastWeighIn = { kg: number; date: string; daysAgo: number };

const DAY_MS = 86_400_000;

/** The newest weigh-in and how long ago it was. */
export function lastWeighIn(
  weights: { date: string; kg: number }[],
  today: string,
): LastWeighIn | null {
  const last = weights.reduce<{ date: string; kg: number } | null>(
    (best, w) => (!best || w.date > best.date ? w : best),
    null,
  );
  if (!last) return null;
  const daysAgo = Math.max(
    0,
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) -
        Date.parse(`${last.date}T00:00:00Z`)) /
        DAY_MS,
    ),
  );
  return { kg: last.kg, date: last.date, daysAgo };
}

export function weighInText(last: LastWeighIn | null): string {
  if (!last) return "Log your first weigh-in";
  const when =
    last.daysAgo === 0
      ? "today"
      : last.daysAgo === 1
        ? "yesterday"
        : `${last.daysAgo} days ago`;
  return `${last.kg} kg · ${when}`;
}
