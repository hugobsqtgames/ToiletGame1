import type { MechanicId } from '../core/types';
import { DEFAULT_SKIN, isSkinId } from './skins';
import { isValidDayKey } from './time';

/**
 * Save data schema, defaults, validation and migrations. Persistence itself is
 * in services/storage.ts; everything here is pure and unit-tested.
 */
export const SAVE_VERSION = 2;

export type QualitySetting = 'auto' | 'low' | 'medium' | 'high';
export type LanguageSetting = 'auto' | 'en' | 'fr';

export interface MissionState {
  id: string;
  metric: MetricId;
  target: number;
  progress: number;
  claimed: boolean;
  reward: Reward;
}

export interface Reward {
  coins?: number;
  gems?: number;
  keys?: number;
  chest?: 'basic' | 'epic';
  skin?: string;
}

export type MetricId =
  | 'runs'
  | 'wins'
  | 'gates'
  | 'multipliers'
  | 'bigMultipliers'
  | 'peakCrowd'
  | 'finishCrowd'
  | 'coinsEarned'
  | 'rivalsDefeated'
  | 'stragglers'
  | 'chestsOpened'
  | 'perfect'
  | 'challenges'
  | 'topStall'
  | 'people';

export interface Stats {
  runs: number;
  wins: number;
  losses: number;
  people: number; // total members brought to the finish
  bestCrowd: number; // best peak in a run
  bestFinish: number; // best finish count
  gates: number;
  multipliers: number;
  bigMultipliers: number;
  rivalsDefeated: number;
  stragglers: number;
  coinsEarned: number;
  chestsOpened: number;
  perfect: number;
  challenges: number;
  topStall: number; // times reaching the x10 stall
  revives: number;
}

export interface SaveData {
  version: number;
  createdAt: number;
  updatedAt: number;
  level: number;
  coins: number;
  gems: number;
  keys: number;
  upgrades: { startCrowd: number; income: number };
  skins: { owned: string[]; selected: string };
  chest: { progress: number; basic: number; epic: number };
  daily: { lastClaimDay: string | null; streak: number; bestStreak: number };
  missions: {
    dailyKey: string | null;
    daily: MissionState[];
    weeklyKey: string | null;
    weekly: MissionState[];
    /** Highest claimed tier per achievement id. */
    achievements: Record<string, number>;
  };
  dailyChallenge: { dayKey: string | null; best: number; completed: boolean };
  stats: Stats;
  seenMechanics: MechanicId[];
  seenWorlds: number;
  settings: {
    music: boolean;
    sfx: boolean;
    haptics: boolean;
    language: LanguageSetting;
    quality: QualitySetting;
    analytics: boolean;
  };
  ads: { lastInterstitialAt: number; levelsSinceInterstitial: number; freeCoinsDay: string | null; freeCoinsCount: number };
  purchases: { removeAds: boolean; starter: boolean; processed: string[] };
  /** Level in progress when the app was closed (analytics/abandon tracking only). */
  runInProgress: number | null;
}

export const emptyStats = (): Stats => ({
  runs: 0, wins: 0, losses: 0, people: 0, bestCrowd: 0, bestFinish: 0, gates: 0, multipliers: 0, bigMultipliers: 0,
  rivalsDefeated: 0, stragglers: 0, coinsEarned: 0, chestsOpened: 0, perfect: 0, challenges: 0, topStall: 0, revives: 0,
});

export function defaultSave(now: number): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    level: 1,
    coins: 0,
    gems: 0,
    keys: 0,
    upgrades: { startCrowd: 0, income: 0 },
    skins: { owned: [DEFAULT_SKIN], selected: DEFAULT_SKIN },
    chest: { progress: 0, basic: 0, epic: 0 },
    daily: { lastClaimDay: null, streak: 0, bestStreak: 0 },
    missions: { dailyKey: null, daily: [], weeklyKey: null, weekly: [], achievements: {} },
    dailyChallenge: { dayKey: null, best: 0, completed: false },
    stats: emptyStats(),
    seenMechanics: [],
    seenWorlds: 1,
    settings: { music: true, sfx: true, haptics: true, language: 'auto', quality: 'auto', analytics: true },
    ads: { lastInterstitialAt: 0, levelsSinceInterstitial: 0, freeCoinsDay: null, freeCoinsCount: 0 },
    purchases: { removeAds: false, starter: false, processed: [] },
    runInProgress: null,
  };
}

/* ---------------- validation helpers ---------------- */

const MAX_SAFE = 1e12;
const MAX_TIME = 8.64e15;
const int = (v: unknown, def: number, min = 0, max = MAX_SAFE) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : def;
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], def: T): T => (allowed.includes(v as T) ? (v as T) : def);
const dayOrNull = (v: unknown) => (isValidDayKey(v) ? v : null);

const METRICS: MetricId[] = ['runs', 'wins', 'gates', 'multipliers', 'bigMultipliers', 'peakCrowd', 'finishCrowd', 'coinsEarned', 'rivalsDefeated', 'stragglers', 'chestsOpened', 'perfect', 'challenges', 'topStall', 'people'];

function sanitizeReward(v: unknown): Reward {
  const o = obj(v);
  const r: Reward = {};
  if (o.coins !== undefined) r.coins = int(o.coins, 0);
  if (o.gems !== undefined) r.gems = int(o.gems, 0, 0, 10_000);
  if (o.keys !== undefined) r.keys = int(o.keys, 0, 0, 100);
  if (o.chest === 'basic' || o.chest === 'epic') r.chest = o.chest;
  if (isSkinId(o.skin)) r.skin = o.skin;
  return r;
}

function sanitizeMissions(v: unknown): MissionState[] {
  if (!Array.isArray(v)) return [];
  const out: MissionState[] = [];
  for (const m of v.slice(0, 10)) {
    const o = obj(m);
    if (typeof o.id !== 'string' || !METRICS.includes(o.metric as MetricId)) continue;
    out.push({
      id: o.id,
      metric: o.metric as MetricId,
      target: int(o.target, 1, 1),
      progress: int(o.progress, 0),
      claimed: bool(o.claimed, false),
      reward: sanitizeReward(o.reward),
    });
  }
  return out;
}

/**
 * Turns any parsed JSON (possibly corrupted, partial, old or tampered) into a
 * valid SaveData. Never throws.
 */
export function sanitizeSave(raw: unknown, now: number): SaveData {
  const d = defaultSave(now);
  const o = obj(raw);
  const stats = obj(o.stats);
  const st = emptyStats();
  for (const k of Object.keys(st) as (keyof Stats)[]) st[k] = int(stats[k], 0);

  const skins = obj(o.skins);
  const owned = Array.isArray(skins.owned) ? [...new Set(skins.owned.filter(isSkinId))] : [];
  if (!owned.includes(DEFAULT_SKIN)) owned.unshift(DEFAULT_SKIN);
  const selected = isSkinId(skins.selected) && owned.includes(skins.selected) ? skins.selected : DEFAULT_SKIN;

  const settings = obj(o.settings);
  const missions = obj(o.missions);
  const ach: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(missions.achievements))) ach[k] = int(v, 0, 0, 10_000);
  const daily = obj(o.daily);
  const dc = obj(o.dailyChallenge);
  const ads = obj(o.ads);
  const purchases = obj(o.purchases);
  const chest = obj(o.chest);
  const upgrades = obj(o.upgrades);

  return {
    version: SAVE_VERSION,
    createdAt: int(o.createdAt, now, 0, MAX_TIME),
    updatedAt: int(o.updatedAt, now, 0, MAX_TIME),
    level: int(o.level, 1, 1, 100_000_000),
    coins: int(o.coins, 0),
    gems: int(o.gems, 0),
    keys: int(o.keys, 0, 0, 1000),
    upgrades: { startCrowd: int(upgrades.startCrowd, 0, 0, 60), income: int(upgrades.income, 0, 0, 50) },
    skins: { owned, selected },
    chest: { progress: int(chest.progress, 0, 0, 100), basic: int(chest.basic, 0, 0, 999), epic: int(chest.epic, 0, 0, 999) },
    daily: {
      lastClaimDay: dayOrNull(daily.lastClaimDay),
      streak: int(daily.streak, 0, 0, 100_000),
      bestStreak: int(daily.bestStreak, 0, 0, 100_000),
    },
    missions: {
      dailyKey: dayOrNull(missions.dailyKey),
      daily: sanitizeMissions(missions.daily),
      weeklyKey: typeof missions.weeklyKey === 'string' ? missions.weeklyKey : null,
      weekly: sanitizeMissions(missions.weekly),
      achievements: ach,
    },
    dailyChallenge: { dayKey: dayOrNull(dc.dayKey), best: int(dc.best, 0), completed: bool(dc.completed, false) },
    stats: st,
    seenMechanics: Array.isArray(o.seenMechanics) ? (o.seenMechanics.filter((x) => typeof x === 'string') as MechanicId[]).slice(0, 64) : [],
    seenWorlds: int(o.seenWorlds, 1, 1),
    settings: {
      music: bool(settings.music, d.settings.music),
      sfx: bool(settings.sfx, d.settings.sfx),
      haptics: bool(settings.haptics, d.settings.haptics),
      language: oneOf(settings.language, ['auto', 'en', 'fr'] as const, 'auto'),
      quality: oneOf(settings.quality, ['auto', 'low', 'medium', 'high'] as const, 'auto'),
      analytics: bool(settings.analytics, true),
    },
    ads: {
      lastInterstitialAt: int(ads.lastInterstitialAt, 0, 0, MAX_TIME),
      levelsSinceInterstitial: int(ads.levelsSinceInterstitial, 0, 0, 1000),
      freeCoinsDay: dayOrNull(ads.freeCoinsDay),
      freeCoinsCount: int(ads.freeCoinsCount, 0, 0, 100),
    },
    purchases: {
      removeAds: bool(purchases.removeAds, false),
      starter: bool(purchases.starter, false),
      processed: Array.isArray(purchases.processed) ? purchases.processed.filter((x) => typeof x === 'string').slice(-200) : [],
    },
    runInProgress: o.runInProgress === null || o.runInProgress === undefined ? null : int(o.runInProgress, 1, 1),
  };
}

/**
 * Version migrations, applied in order before sanitizing. Each step receives
 * the raw object of version N and returns version N+1.
 */
const MIGRATIONS: Record<number, (o: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 stored a flat `chestProgress` and `removeAds`; v2 nests them.
  1: (o) => {
    const { chestProgress, removeAds, ...rest } = o;
    return {
      ...rest,
      version: 2,
      chest: { progress: chestProgress ?? 0, basic: 0, epic: 0 },
      purchases: { ...obj(rest.purchases), removeAds: removeAds === true },
    };
  },
};

export function migrateSave(raw: unknown, now: number): SaveData {
  let o = obj(raw);
  let v = int(o.version, 1, 1);
  if (v > SAVE_VERSION) {
    // Written by a newer app build: keep what we understand.
    return sanitizeSave(o, now);
  }
  while (v < SAVE_VERSION && MIGRATIONS[v]) {
    o = MIGRATIONS[v](o);
    v++;
  }
  return sanitizeSave(o, now);
}

/** Small string checksum (FNV-1a) to detect truncated/corrupted payloads. */
export function checksum(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export interface Envelope {
  v: number;
  c: string;
  d: string;
}

export function encodeSave(save: SaveData): string {
  const d = JSON.stringify(save);
  return JSON.stringify({ v: SAVE_VERSION, c: checksum(d), d } satisfies Envelope);
}

/** Returns null when the payload is unreadable or fails its checksum. */
export function decodeSave(text: string | null, now: number): SaveData | null {
  if (!text) return null;
  try {
    const env = JSON.parse(text) as Partial<Envelope>;
    if (typeof env.d !== 'string' || typeof env.c !== 'string') return null;
    if (checksum(env.d) !== env.c) return null;
    return migrateSave(JSON.parse(env.d), now);
  } catch {
    return null;
  }
}
