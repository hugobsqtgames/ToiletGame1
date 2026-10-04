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
  // Calendar arithmetic on UTC dates built from the LOCAL date: immune to DST
  // (a local-time difference across a DST switch is 1 h short of whole weeks,
  // which used to give two consecutive weeks the same key in years starting on a Monday).
  const monday = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - day);
  const year = new Date(monday).getUTCFullYear();
  const week = Math.floor((monday - Date.UTC(year, 0, 1)) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
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
export const isValidWeekKey = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-W\d{2}$/.test(k);

/**
 * Anti clock-rollback window (days). A stored date slightly in the future means the
 * clock was rolled back to farm rewards: refused. A date FAR in the future means the
 * device clock was wrong when it was stored: recover instead of locking the player
 * out for months.
 */
export const ROLLBACK_WINDOW_DAYS = 7;

/** Approximate weeks between two week keys (b - a). */
export function weekDiff(a: string, b: string): number {
  const p = (k: string) => {
    const [y, w] = k.split('-W').map(Number);
    return y * 52.1775 + w;
  };
  return Math.round(p(b) - p(a));
}
