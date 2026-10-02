export const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Frame-rate independent exponential smoothing factor. */
export const damp = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);

/** Rounds to a "nice" human number (5, 10, 25, 50...) for gate labels. */
export function niceRound(v: number): number {
  if (v <= 10) return Math.max(1, Math.round(v));
  if (v <= 50) return Math.round(v / 5) * 5;
  if (v <= 200) return Math.round(v / 10) * 10;
  if (v <= 1000) return Math.round(v / 25) * 25;
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
}

/** Saturating curve: 0 at x=0, approaches 1 as x grows (never reaches). */
export const saturate = (x: number, scale: number) => 1 - Math.exp(-x / scale);
