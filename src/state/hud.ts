import type { SimPhase } from '../core/simulation';
import { createStore } from './store';

/** High-frequency gameplay values for the HUD (updated by the controller, throttled). */
export interface HudState {
  count: number;
  progress: number;
  coins: number;
  keys: number;
  phase: SimPhase;
  rivalCount: number;
  stall: number; // multiplier reached at the finish
  /** Increments on notable events so UI can animate (pulse). */
  pulse: number;
  pulseKind: 'good' | 'bad' | 'mult' | 'none';
  tutorialStep: 'none' | 'drag' | 'gate' | 'obstacle' | 'finish';
}

export const hud = createStore<HudState>({
  count: 0, progress: 0, coins: 0, keys: 0, phase: 'ready', rivalCount: 0, stall: 0, pulse: 0, pulseKind: 'none', tutorialStep: 'none',
});
