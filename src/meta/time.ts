/** Local calendar helpers. Day keys are local dates "YYYY-MM-DD". */

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Days between two day keys (b - a), DST-safe (uses UTC noon). */
export function dayDiff(a: string, b: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d, 12);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** ISO-like week key "YYYY-Www" (weeks start Monday, local time). */
export function weekKey(ms: number): string {
  const d = new Date(ms);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  const jan1 = new Date(monday.getFullYear(), 0, 1);
  const week = Math.floor((monday.getTime() - jan1.getTime()) / (7 * 86_400_000)) + 1;
  return `${monday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Milliseconds until next local midnight. */
export function msUntilTomorrow(ms: number): number {
  const d = new Date(ms);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return next.getTime() - ms;
}

/** Milliseconds until next Monday 00:00 local. */
export function msUntilNextWeek(ms: number): number {
  const d = new Date(ms);
  const day = (d.getDay() + 6) % 7;
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (7 - day));
  return next.getTime() - ms;
}

export const isValidDayKey = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
