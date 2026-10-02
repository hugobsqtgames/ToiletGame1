import { SIM, TRACK } from './config';
import { Simulation } from './simulation';
import type { Rng } from './rng';

/**
 * Autoplay agents used by tests and balancing scripts (never shipped to players
 * as a feature). The "planner" bot looks ahead by cloning the simulation and
 * picking the lateral target that maximizes the crowd after a short horizon.
 */

export interface BotResult {
  won: boolean;
  finishCount: number;
  peak: number;
  multiplier: number;
  timeSec: number;
}

const CANDIDATES = 11;

export function plannerBot(sim: Simulation, opts: { horizon?: number; decisionEvery?: number; revive?: boolean } = {}): BotResult {
  const horizon = opts.horizon ?? 1.6;
  const every = opts.decisionEvery ?? 0.15;
  const dt = SIM.fixedDt;
  sim.start();
  let nextDecision = 0;
  let mult = 1;
  let finishCount = 0;
  let guard = 0;
  while (!sim.finished && guard++ < 60 * 400) {
    if (sim.s.t >= nextDecision && (sim.s.phase === 'running')) {
      nextDecision = sim.s.t + every;
      sim.setTarget(bestTarget(sim, horizon));
    }
    sim.step(dt);
    for (const e of sim.drainEvents()) {
      if (e.type === 'won') {
        mult = e.multiplier;
        finishCount = e.finishCount;
      }
    }
    if (sim.s.phase === 'lost' && opts.revive && sim.canRevive()) {
      sim.revive(Math.max(10, Math.ceil(sim.s.stats.peak * 0.35)));
    }
  }
  return { won: sim.s.phase === 'won', finishCount, peak: sim.s.stats.peak, multiplier: mult, timeSec: sim.s.t };
}

export function bestTarget(sim: Simulation, horizon: number): number {
  const half = TRACK.width / 2;
  let best = sim.s.targetX;
  let bestScore = -Infinity;
  for (let i = 0; i < CANDIDATES; i++) {
    const x = -half + (TRACK.width * i) / (CANDIDATES - 1);
    const score = evaluate(sim, x, horizon);
    // Slight preference for staying put (less jitter).
    const adj = score - Math.abs(x - sim.s.x) * 0.01;
    if (adj > bestScore) {
      bestScore = adj;
      best = x;
    }
  }
  return best;
}

function evaluate(sim: Simulation, x: number, horizon: number): number {
  const c = sim.clone();
  c.drainEvents();
  c.setTarget(x);
  const steps = Math.round(horizon / SIM.fixedDt);
  for (let i = 0; i < steps && !c.finished; i++) {
    c.step(SIM.fixedDt);
    // Second stage: hold position (greedy approximation).
  }
  if (c.s.phase === 'lost') return -1e9 + c.s.z;
  // Reward crowd size, but log-scaled so it does not ignore safety.
  return Math.log(1 + c.s.count) * 100 + c.s.stats.coins * 0.1;
}

/** Random player: steers to random lanes. Used to verify difficulty matters. */
export function randomBot(sim: Simulation, rng: Rng): BotResult {
  const dt = SIM.fixedDt;
  sim.start();
  let next = 0;
  let guard = 0;
  let mult = 1;
  let finishCount = 0;
  while (!sim.finished && guard++ < 60 * 400) {
    if (sim.s.t >= next) {
      next = sim.s.t + rng.range(0.4, 1.2);
      sim.setTarget(rng.range(-TRACK.width / 2, TRACK.width / 2));
    }
    sim.step(dt);
    for (const e of sim.drainEvents()) if (e.type === 'won') { mult = e.multiplier; finishCount = e.finishCount; }
  }
  return { won: sim.s.phase === 'won', finishCount, peak: sim.s.stats.peak, multiplier: mult, timeSec: sim.s.t };
}
