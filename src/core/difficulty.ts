import { clamp, lerp, saturate } from './math';
import type { MutatorId } from './types';

/**
 * Difficulty model. Every parameter is a smooth function of the level number.
 * Most parameters saturate (so the game stays physically playable), while a
 * slow unbounded "pressure" term keeps increasing pattern density and the
 * tightness of decisions forever. Never a modulo, never a hard cap on levels.
 */
export interface DifficultyParams {
  /** Unbounded scalar, ~level/10 early then logarithmic. Used for reporting. */
  scalar: number;
  speed: number;
  /** Target run duration in seconds (before the finish corridor). */
  duration: number;
  /** Gap between patterns in meters. */
  gap: number;
  /** Probability that a pattern carries hazards. */
  hazard: number;
  /** 0 = obvious gate choices, 1 = near-tie dilemmas. */
  dilemma: number;
  /** Rival crowd size relative to the expected crowd. */
  rivalRatio: number;
  /** Multiplier for moving obstacle speeds. */
  motion: number;
  /** Probability of combining hazards with gate rows. */
  combo: number;
  /** Maximum number of gate options in a row. */
  maxOptions: number;
  /** Upper soft band for the expected crowd (controls inflation). */
  crowdBand: number;
}

export function difficultyFor(level: number, mutators: MutatorId[] = []): DifficultyParams {
  const L = Math.max(1, level);
  const x = L - 1;
  // Unbounded slow term: grows like log10 after level 150.
  const pressure = L > 150 ? Math.log10(L / 150) : 0;

  let speed = 8.6 + 3.2 * saturate(x, 90) + 0.4 * Math.min(1, pressure);
  if (mutators.includes('rushHour')) speed *= 1.1;

  const duration = L === 1 ? 24 : 30 + 13 * saturate(x, 140);
  const gap = clamp(lerp(19, 12.5, saturate(x, 110)) - 1.2 * pressure, 10.5, 19);
  const hazard = clamp(0.25 + 0.6 * saturate(x - 1, 45) + 0.08 * pressure, 0, 0.95);
  const dilemma = clamp(saturate(x, 70) + 0.1 * pressure, 0, 1);
  const rivalRatio = clamp(0.3 + 0.4 * saturate(x - 8, 110) + 0.04 * pressure, 0.3, 0.78);
  const motion = 1 + 0.55 * saturate(x - 10, 160) + 0.1 * Math.min(2, pressure);
  const combo = clamp(saturate(x - 15, 90) + 0.1 * pressure, 0, 0.9);
  const maxOptions = L < 6 ? 2 : 3;
  const crowdBand = Math.min(60_000, 220 + 30 * L);

  return {
    scalar: x / 10 < 10 ? x / 10 : 10 + Math.log2(1 + (x - 100) / 50),
    speed,
    duration,
    gap,
    hazard,
    dilemma,
    rivalRatio,
    motion,
    combo,
    maxOptions,
    crowdBand,
  };
}
