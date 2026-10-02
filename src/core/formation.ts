import { CROWD, LOGIC_MEMBER_CAP } from './config';

/**
 * Phyllotaxis (sunflower) formation: dense, round, organic-looking and stable
 * when members are added/removed (slot i never moves when the crowd grows).
 */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const MAX_SLOTS = LOGIC_MEMBER_CAP;

export const UNIT_X = new Float32Array(MAX_SLOTS);
export const UNIT_Z = new Float32Array(MAX_SLOTS);
for (let i = 0; i < MAX_SLOTS; i++) {
  const r = Math.sqrt(i + 0.5);
  const a = i * GOLDEN;
  UNIT_X[i] = r * Math.cos(a);
  UNIT_Z[i] = r * Math.sin(a);
}

/** Spacing between members for a crowd of `m` visible members. */
export function spacingFor(m: number): number {
  return Math.min(CROWD.baseSpacing, CROWD.maxFormationRadius / Math.sqrt(Math.max(1, m)));
}

/** Outer radius of the formation for `m` visible members. */
export function radiusFor(m: number): number {
  if (m <= 0) return 0;
  return spacingFor(m) * Math.sqrt(m) + CROWD.memberRadius;
}

/** Logic members simulated for a count (deterministic, quality independent). */
export const logicMembers = (count: number) => Math.min(count, LOGIC_MEMBER_CAP);
