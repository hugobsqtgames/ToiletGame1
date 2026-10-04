/** Compact number formatting used across HUD and menus: 950, 1.2K, 34K, 1.5M. */
export function formatCount(n: number): string {
  // NaN/Infinity must never reach the HUD ("NaNB" was possible before).
  const v = Number.isNaN(n) ? 0 : Math.max(0, Math.floor(Math.min(n, 999e9)));
  if (v < 1000) return String(v);
  if (v < 10_000) return trim((v / 1000).toFixed(1)) + 'K';
  if (v < 1_000_000) return Math.floor(v / 1000) + 'K';
  if (v < 10_000_000) return trim((v / 1_000_000).toFixed(1)) + 'M';
  if (v < 1_000_000_000) return Math.floor(v / 1_000_000) + 'M';
  return trim((v / 1_000_000_000).toFixed(1)) + 'B';
}

function trim(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function toRoman(n: number): string {
  if (n <= 0 || n > 3999) return String(n);
  const map: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of map) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}
