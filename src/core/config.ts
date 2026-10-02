/** Central gameplay/balance constants. Tweak here, not in systems. */
export const TRACK = {
  /** Playable width in meters (x ∈ [-W/2, W/2]). */
  width: 10,
  /** Distance before the first pattern. */
  introLength: 26,
  /** Length of the finish corridor (stalls). */
  finishLength: 46,
};

export const CROWD = {
  /** Hard cap on the logical count to keep numbers sane. */
  maxCount: 9_999_999,
  /** Lateral speed of the crowd center toward the finger target (m/s). */
  lateralSpeed: 16,
  /** Collision radius of a single member. */
  memberRadius: 0.13,
  /** Formation outer radius target when the crowd is at its visual cap. */
  maxFormationRadius: 2.9,
  /** Spacing used for small crowds. */
  baseSpacing: 0.25,
  /** Grace period (s) after a revive during which obstacles do not kill. */
  reviveGrace: 2.2,
};

/** Simulated/rendered member cap (deterministic, independent from rendering quality). */
export const LOGIC_MEMBER_CAP = 220;

export const BATTLE = {
  /** Fraction of the smaller side destroyed per second (min clamp below). */
  rate: 2.4,
  minPerSecond: 14,
};

export const SIM = {
  fixedDt: 1 / 60,
  maxStepsPerFrame: 5,
};

export const LEVELS_PER_WORLD = 10;
