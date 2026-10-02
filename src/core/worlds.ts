import { LEVELS_PER_WORLD } from './config';
import { hash2, Rng } from './rng';
import { toRoman } from './format';
import type { MechanicId, MutatorId } from './types';

export type DecorKind = 'mall' | 'stadium' | 'airport' | 'waterpark' | 'museum' | 'space' | 'palace' | 'manor';

export interface ThemeColors {
  skyTop: string;
  skyBottom: string;
  fog: string;
  tileA: string;
  tileB: string;
  rail: string;
  wall: string;
  accent: string;
  /** UI gradient for banners. */
  ui: [string, string];
}

export interface BaseTheme {
  id: DecorKind;
  name: { en: string; fr: string };
  tagline: { en: string; fr: string };
  colors: ThemeColors;
  /** Mechanics first introduced in this world. */
  introduces: MechanicId[];
  music: 'groove' | 'march' | 'jazz' | 'surf' | 'spooky';
}

/**
 * The 8 hand-designed base worlds. Worlds 9+ are "Remix" worlds: they reuse a
 * base environment, but with a shifted palette, combined mechanics from the
 * whole pool, mutators and an ever-increasing difficulty scalar.
 */
export const BASE_THEMES: BaseTheme[] = [
  {
    id: 'mall',
    name: { en: 'Mall Mayhem', fr: 'Panique au Centre' },
    tagline: { en: 'Too many smoothies...', fr: 'Trop de smoothies...' },
    colors: {
      skyTop: '#7FD3FF', skyBottom: '#E6F7FF', fog: '#CDEFFF',
      tileA: '#F5F1E8', tileB: '#E3DDCF', rail: '#4FB8F0', wall: '#FFB84D', accent: '#FF5FA2',
      ui: ['#3FB6FF', '#2B7BFF'],
    },
    introduces: ['gate_add', 'gate_mul', 'wall', 'gate_sub', 'pickup'],
    music: 'groove',
  },
  {
    id: 'stadium',
    name: { en: 'Stadium Stampede', fr: 'Ruée au Stade' },
    tagline: { en: 'Half-time. One restroom.', fr: 'Mi-temps. Un seul WC.' },
    colors: {
      skyTop: '#2C3E8F', skyBottom: '#6FA0FF', fog: '#5D7FD8',
      tileA: '#4CC46A', tileB: '#3DAE5A', rail: '#FFFFFF', wall: '#FF4D5E', accent: '#FFE14D',
      ui: ['#4CD07A', '#1E9E57'],
    },
    introduces: ['gate_div', 'sweeper', 'rival'],
    music: 'march',
  },
  {
    id: 'airport',
    name: { en: 'Airport Dash', fr: 'Course à l\'Aéroport' },
    tagline: { en: 'Boarding in 5 minutes!', fr: 'Embarquement dans 5 min !' },
    colors: {
      skyTop: '#FF9A62', skyBottom: '#FFE3C2', fog: '#FFD1A8',
      tileA: '#DCE3EA', tileB: '#C7D0DA', rail: '#3A4A5C', wall: '#2E8BFF', accent: '#FFC21A',
      ui: ['#FF9A3D', '#FF5F3D'],
    },
    introduces: ['slider', 'gate_timed', 'blower'],
    music: 'jazz',
  },
  {
    id: 'waterpark',
    name: { en: 'Splash Park', fr: 'Parc Aquatique' },
    tagline: { en: 'Everyone drank the pool.', fr: 'Tout le monde a bu la tasse.' },
    colors: {
      skyTop: '#2FD5E8', skyBottom: '#D8FFF7', fog: '#A8F0EA',
      tileA: '#FFF4D6', tileB: '#FFE7A8', rail: '#FF6B8A', wall: '#2FB5FF', accent: '#7A5CFF',
      ui: ['#22D3C5', '#1597D6'],
    },
    introduces: ['puddle', 'gate_pct', 'roller'],
    music: 'surf',
  },
  {
    id: 'museum',
    name: { en: 'Museum Madness', fr: 'Folie au Musée' },
    tagline: { en: 'Please do not run. (They run.)', fr: 'Merci de ne pas courir. (Ils courent.)' },
    colors: {
      skyTop: '#B79CFF', skyBottom: '#F3ECFF', fog: '#E0D4FF',
      tileA: '#F2E9DC', tileB: '#D9C9B4', rail: '#8C5A3C', wall: '#C9A34E', accent: '#E8463A',
      ui: ['#A27BFF', '#6C4BE0'],
    },
    introduces: ['stomper', 'gate_mystery', 'boxes'],
    music: 'jazz',
  },
  {
    id: 'space',
    name: { en: 'Space Station', fr: 'Station Spatiale' },
    tagline: { en: 'Zero-G. Zero patience.', fr: 'Zéro gravité. Zéro patience.' },
    colors: {
      skyTop: '#0B0F2E', skyBottom: '#2B2F7A', fog: '#1C2160',
      tileA: '#C9D3E6', tileB: '#AAB6CF', rail: '#3DF5FF', wall: '#7B6CFF', accent: '#FF4DD8',
      ui: ['#5B5BFF', '#2A1FA8'],
    },
    introduces: ['gate_cond', 'gate_moving', 'turnstile'],
    music: 'groove',
  },
  {
    id: 'palace',
    name: { en: 'Royal Rush', fr: 'Ruée Royale' },
    tagline: { en: 'The Royal Throne awaits.', fr: 'Le Trône Royal vous attend.' },
    colors: {
      skyTop: '#FF7EB6', skyBottom: '#FFE6F1', fog: '#FFD0E4',
      tileA: '#FFFFFF', tileB: '#F0E2C8', rail: '#D4A017', wall: '#C2185B', accent: '#FFD54F',
      ui: ['#FF6FAE', '#D81B78'],
    },
    introduces: [],
    music: 'march',
  },
  {
    id: 'manor',
    name: { en: 'Spooky Manor', fr: 'Manoir Hanté' },
    tagline: { en: 'Something is in stall #3...', fr: 'Il y a quelque chose dans la cabine 3...' },
    colors: {
      skyTop: '#1E1433', skyBottom: '#4E3A75', fog: '#3A2C5A',
      tileA: '#6E6A80', tileB: '#57546A', rail: '#9CFF5A', wall: '#5B3A8C', accent: '#FF8A1F',
      ui: ['#7B4BD6', '#3E2475'],
    },
    introduces: [],
    music: 'spooky',
  },
];

export const BASE_WORLD_COUNT = BASE_THEMES.length;

export interface WorldInfo {
  world: number;
  themeIndex: number;
  theme: BaseTheme;
  /** 0 for the 8 base worlds, 1+ for remix cycles. */
  cycle: number;
  colors: ThemeColors;
  mutators: MutatorId[];
  firstLevel: number;
  lastLevel: number;
  displayName: { en: string; fr: string };
}

/** Which world a level belongs to (1-based). */
export const worldOfLevel = (level: number) => Math.floor((Math.max(1, level) - 1) / LEVELS_PER_WORLD) + 1;
export const isBossLevel = (level: number) => level % LEVELS_PER_WORLD === 0;

const ALL_MUTATORS: MutatorId[] = ['rushHour', 'butterfingers', 'rivalry', 'foggy', 'mystery', 'tight', 'windy'];

/** Deterministic world description, valid for any world number (infinite). */
export function getWorld(world: number): WorldInfo {
  const w = Math.max(1, Math.floor(world));
  const themeIndex = (w - 1) % BASE_WORLD_COUNT;
  const cycle = Math.floor((w - 1) / BASE_WORLD_COUNT);
  const theme = BASE_THEMES[themeIndex];
  const colors = cycle === 0 ? theme.colors : remixColors(theme.colors, w);
  const mutators: MutatorId[] = [];
  if (themeIndex === 7 && cycle === 0) mutators.push('foggy');
  if (cycle > 0) {
    const rng = new Rng(hash2(w, 0xa11ce));
    const n = Math.min(3, 1 + Math.floor(cycle / 2));
    const pool = rng.shuffle([...ALL_MUTATORS]);
    mutators.push(...pool.slice(0, n));
  }
  const suffix = cycle > 0 ? ' ' + toRoman(cycle + 1) : '';
  return {
    world: w,
    themeIndex,
    theme,
    cycle,
    colors,
    mutators,
    firstLevel: (w - 1) * LEVELS_PER_WORLD + 1,
    lastLevel: w * LEVELS_PER_WORLD,
    displayName: { en: theme.name.en + suffix, fr: theme.name.fr + suffix },
  };
}

/** Every mechanic unlocked up to (and including) a world. */
export function unlockedMechanics(world: number): Set<MechanicId> {
  const set = new Set<MechanicId>();
  const upto = Math.min(world, BASE_WORLD_COUNT);
  for (let i = 0; i < upto; i++) for (const m of BASE_THEMES[i].introduces) set.add(m);
  return set;
}

/* ---------- color helpers (pure, no deps) ---------- */

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = f(p, q, h + 1 / 3);
    g = f(p, q, h);
    b = f(p, q, h - 1 / 3);
  }
  const to = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

export function shiftHue(hex: string, dh: number, ds = 0, dl = 0): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((((h + dh) % 1) + 1) % 1, Math.max(0, Math.min(1, s + ds)), Math.max(0, Math.min(1, l + dl)));
}

function remixColors(c: ThemeColors, world: number): ThemeColors {
  const rng = new Rng(hash2(world, 0xc0102));
  const dh = rng.range(0.12, 0.88);
  const sh = (x: string) => shiftHue(x, dh);
  return {
    skyTop: sh(c.skyTop), skyBottom: sh(c.skyBottom), fog: sh(c.fog),
    tileA: c.tileA, tileB: c.tileB, // keep the floor readable
    rail: sh(c.rail), wall: sh(c.wall), accent: sh(c.accent),
    ui: [sh(c.ui[0]), sh(c.ui[1])],
  };
}
