const DAY_MS = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Consecutive days with at least one log, ending today.
 * If today has no log yet, the streak still counts up to yesterday.
 */
export function loggingStreak(dates: string[], today: string): number {
  const logged = new Set(dates);
  let cur = Date.parse(`${today}T00:00:00Z`);
  if (!logged.has(today)) cur -= DAY_MS;
  let n = 0;
  while (logged.has(ymd(cur))) {
    n++;
    cur -= DAY_MS;
  }
  return n;
}

/** Longest run of consecutive logged days ever. */
export function bestStreak(dates: string[]): number {
  const days = [...new Set(dates)]
    .map((d) => Date.parse(`${d}T00:00:00Z`) / DAY_MS)
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && d - days[i - 1] === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}
