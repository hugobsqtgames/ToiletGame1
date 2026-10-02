import { niceRound } from '../core/math';
import { hashString, Rng } from '../core/rng';
import type { MetricId, MissionState, Reward, SaveData, Stats } from './save';
import { dayKey, weekKey } from './time';

/**
 * Missions: 3 daily + 3 weekly (seeded by date, so they're stable during the
 * day/week) and infinite-tier achievements (lifetime milestones).
 */

interface MissionTemplate {
  metric: MetricId;
  /** Target for a player at `level`. */
  target: (level: number) => number;
  /** 'max' metrics track the best single run; 'sum' accumulate. */
  mode: 'sum' | 'max';
  /** Only offered once the player can actually do it. */
  minLevel?: number;
}

const DAILY_POOL: MissionTemplate[] = [
  { metric: 'runs', target: () => 5, mode: 'sum' },
  { metric: 'wins', target: () => 3, mode: 'sum' },
  { metric: 'multipliers', target: () => 8, mode: 'sum' },
  { metric: 'peakCrowd', target: (l) => niceRound(60 + l * 8), mode: 'max' },
  { metric: 'finishCrowd', target: (l) => niceRound(40 + l * 5), mode: 'max' },
  { metric: 'coinsEarned', target: (l) => niceRound(300 + l * 25), mode: 'sum' },
  { metric: 'gates', target: () => 20, mode: 'sum' },
  { metric: 'stragglers', target: (l) => niceRound(30 + l * 2), mode: 'sum', minLevel: 4 },
  { metric: 'rivalsDefeated', target: () => 2, mode: 'sum', minLevel: 12 },
  { metric: 'perfect', target: () => 1, mode: 'sum', minLevel: 3 },
  { metric: 'bigMultipliers', target: () => 3, mode: 'sum', minLevel: 3 },
];

const WEEKLY_POOL: MissionTemplate[] = [
  { metric: 'wins', target: () => 20, mode: 'sum' },
  { metric: 'bigMultipliers', target: () => 20, mode: 'sum' },
  { metric: 'people', target: (l) => niceRound(3000 + l * 120), mode: 'sum' },
  { metric: 'coinsEarned', target: (l) => niceRound(3000 + l * 200), mode: 'sum' },
  { metric: 'rivalsDefeated', target: () => 12, mode: 'sum', minLevel: 12 },
  { metric: 'chestsOpened', target: () => 4, mode: 'sum' },
  { metric: 'challenges', target: () => 4, mode: 'sum', minLevel: 5 },
  { metric: 'topStall', target: () => 3, mode: 'sum' },
];

export const MAX_METRICS: MetricId[] = ['peakCrowd', 'finishCrowd'];

function build(pool: MissionTemplate[], seed: number, level: number, prefix: string, weekly: boolean): MissionState[] {
  const rng = new Rng(seed);
  const picks = rng.shuffle(pool.filter((t) => (t.minLevel ?? 0) <= level)).slice(0, 3);
  return picks.map((t, i) => {
    const reward: Reward = weekly
      ? i === 2 ? { gems: 15, chest: 'basic' } : { gems: 8 + i * 2, coins: niceRound(200 + level * 20) }
      : i === 2 ? { gems: 3 } : { coins: niceRound(80 + level * 6) };
    const target = Math.max(1, Math.round(t.target(level) * (weekly ? 1 : 1)));
    return { id: `${prefix}-${i}-${t.metric}`, metric: t.metric, target, progress: 0, claimed: false, reward };
  });
}

/** Refreshes daily/weekly missions if the period changed. Pure. */
export function refreshMissions(save: SaveData, now: number): SaveData {
  const dk = dayKey(now);
  const wk = weekKey(now);
  let missions = save.missions;
  if (missions.dailyKey !== dk || missions.daily.length === 0) {
    missions = { ...missions, dailyKey: dk, daily: build(DAILY_POOL, hashString('d' + dk), save.level, 'd' + dk, false) };
  }
  if (missions.weeklyKey !== wk || missions.weekly.length === 0) {
    missions = { ...missions, weeklyKey: wk, weekly: build(WEEKLY_POOL, hashString('w' + wk), save.level, 'w' + wk, true) };
  }
  return missions === save.missions ? save : { ...save, missions };
}

/** Per-run metric deltas (computed by progression.ts from a run). */
export type MetricDelta = Partial<Record<MetricId, number>>;

export function applyMetrics(list: MissionState[], delta: MetricDelta): { list: MissionState[]; completed: MissionState[] } {
  const completed: MissionState[] = [];
  const out = list.map((m) => {
    const d = delta[m.metric];
    if (d === undefined || m.claimed || m.progress >= m.target) return m;
    const progress = MAX_METRICS.includes(m.metric) ? Math.max(m.progress, d) : m.progress + d;
    const next = { ...m, progress: Math.min(m.target, progress) };
    if (next.progress >= next.target) completed.push(next);
    return next;
  });
  return { list: out, completed };
}

/* ---------------- Achievements (infinite tiers) ---------------- */

export interface AchievementDef {
  id: string;
  /** Lifetime value used for progress. */
  value: (s: SaveData) => number;
  /** Target of tier t (0-based); grows forever. */
  target: (tier: number) => number;
  reward: (tier: number) => Reward;
  icon: string;
}

const geo = (base: number, growth: number) => (t: number) => niceRound(base * Math.pow(growth, t));

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'level', icon: 'flag-checkered', value: (s) => s.level - 1, target: (t) => (t < 4 ? [5, 10, 25, 50][t] : niceRound(50 * Math.pow(2, t - 3))), reward: (t) => ({ gems: 5 + t * 3 }) },
  { id: 'crowd', icon: 'account-group', value: (s) => s.stats.bestCrowd, target: geo(50, 2), reward: (t) => ({ gems: 3 + t * 2 }) },
  { id: 'people', icon: 'human-queue', value: (s) => s.stats.people, target: geo(500, 3), reward: (t) => ({ coins: niceRound(300 * Math.pow(1.8, t)) }) },
  { id: 'rivals', icon: 'sword-cross', value: (s) => s.stats.rivalsDefeated, target: geo(5, 2.5), reward: (t) => ({ gems: 4 + t * 2 }) },
  { id: 'multipliers', icon: 'close-thick', value: (s) => s.stats.bigMultipliers, target: geo(10, 2.5), reward: (t) => ({ coins: niceRound(250 * Math.pow(1.8, t)) }) },
  { id: 'chests', icon: 'treasure-chest', value: (s) => s.stats.chestsOpened, target: geo(3, 2.2), reward: (t) => ({ gems: 5 + t * 3 }) },
  { id: 'challenges', icon: 'trophy', value: (s) => s.stats.challenges, target: geo(3, 2.2), reward: (t) => (t % 3 === 2 ? { chest: 'epic' } : { gems: 6 + t * 2 }) },
  { id: 'perfect', icon: 'star-shooting', value: (s) => s.stats.perfect, target: geo(1, 3), reward: (t) => ({ gems: 10 + t * 4 }) },
];

export function achievementState(save: SaveData, a: AchievementDef) {
  const tier = save.missions.achievements[a.id] ?? 0;
  const target = a.target(tier);
  const value = a.value(save);
  return { tier, target, value, claimable: value >= target, reward: a.reward(tier) };
}

export function countClaimable(save: SaveData): number {
  let n = 0;
  for (const m of [...save.missions.daily, ...save.missions.weekly]) if (!m.claimed && m.progress >= m.target) n++;
  for (const a of ACHIEVEMENTS) if (achievementState(save, a).claimable) n++;
  return n;
}

export const statsToMetricTotals = (s: Stats) => s;
