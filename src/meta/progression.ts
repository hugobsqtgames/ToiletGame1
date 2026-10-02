import { LEVELS_PER_WORLD } from '../core/config';
import { hashString } from '../core/rng';
import type { RunStats } from '../core/simulation';
import type { ChallengeDef, LevelDef, MutatorId } from '../core/types';
import { generateLevel } from '../core/levelGen';
import { worldOfLevel } from '../core/worlds';
import { rollChest, type ChestTier } from './chests';
import { CHEST_WINS, KEYS_PER_CHEST, UPGRADE_MAX, defeatCoins, upgradeCost, victoryCoins, type UpgradeId } from './economy';
import { ACHIEVEMENTS, achievementState, applyMetrics, refreshMissions, type MetricDelta } from './missions';
import type { Reward, SaveData } from './save';
import { SKINS, skinById } from './skins';
import { dayKey } from './time';

/**
 * Pure state transitions for everything that happens outside a run.
 * Every function takes a SaveData and returns a new one (never mutates).
 */

export type RunMode = 'campaign' | 'daily';

export interface RunResult {
  mode: RunMode;
  level: number;
  won: boolean;
  finishCount: number;
  multiplier: number;
  stallIndex: number;
  perfect: boolean;
  progress: number;
  stats: RunStats;
  revived: boolean;
  challenge?: ChallengeDef;
}

export interface RunRewards {
  coins: number;
  /** Coins that a rewarded ad would add (x3 total => +2x). */
  adBonusCoins: number;
  gems: number;
  keys: number;
  challengeDone: boolean;
  chestReady: boolean;
  newWorld: number | null;
  worldSkin: string | null;
  completedMissions: number;
  keyChestReady: boolean;
}

export function grantReward(save: SaveData, r: Reward): SaveData {
  let s = { ...save };
  if (r.coins) s.coins += r.coins;
  if (r.gems) s.gems += r.gems;
  if (r.keys) s.keys += r.keys;
  if (r.chest === 'basic') s.chest = { ...s.chest, basic: s.chest.basic + 1 };
  if (r.chest === 'epic') s.chest = { ...s.chest, epic: s.chest.epic + 1 };
  if (r.skin && !s.skins.owned.includes(r.skin)) s.skins = { ...s.skins, owned: [...s.skins.owned, r.skin] };
  if (r.coins) s.stats = { ...s.stats, coinsEarned: s.stats.coinsEarned + r.coins };
  return s;
}

export function evaluateChallenge(c: ChallengeDef | undefined, r: RunResult): boolean {
  if (!c || !r.won) return false;
  switch (c.kind) {
    case 'finishWith': return r.finishCount >= c.target;
    case 'maxLoss': return r.stats.lost <= c.target;
    case 'noDivide': return r.stats.harmfulGates === 0;
    case 'bigMultiplier': return r.stats.maxMultiplier >= c.target;
    case 'peak': return r.stats.peak >= c.target;
  }
}

/** Skin awarded for clearing a base world (worlds 2..8 boss). */
export function worldSkinFor(world: number): string | null {
  return SKINS.find((s) => s.unlock.type === 'world' && s.unlock.world === world)?.id ?? null;
}

export function applyRunResult(save0: SaveData, r: RunResult, now: number): { save: SaveData; rewards: RunRewards } {
  let save = refreshMissions(save0, now);
  const rewards: RunRewards = {
    coins: 0, adBonusCoins: 0, gems: 0, keys: r.stats.keys, challengeDone: false, chestReady: false,
    newWorld: null, worldSkin: null, completedMissions: 0, keyChestReady: false,
  };

  const st = { ...save.stats };
  st.runs++;
  st.gates += r.stats.gatesTaken;
  st.multipliers += r.stats.multipliersTaken;
  st.bigMultipliers += r.stats.bigMultipliers;
  st.rivalsDefeated += r.stats.rivalsDefeated;
  st.stragglers += r.stats.stragglers;
  st.bestCrowd = Math.max(st.bestCrowd, r.stats.peak);
  if (r.revived) st.revives++;

  if (r.won) {
    st.wins++;
    st.people += r.finishCount;
    st.bestFinish = Math.max(st.bestFinish, r.finishCount);
    if (r.perfect) st.perfect++;
    if (r.stallIndex >= 9) st.topStall++;
    rewards.coins = victoryCoins(r.level, r.finishCount, r.multiplier, save.upgrades.income) + r.stats.coins;
    rewards.adBonusCoins = rewards.coins * 2;
    rewards.challengeDone = evaluateChallenge(r.challenge, r);
    if (rewards.challengeDone) {
      st.challenges++;
      rewards.gems += r.challenge!.rewardGems;
    }
  } else {
    st.losses++;
    rewards.coins = defeatCoins(r.level, r.progress, save.upgrades.income) + r.stats.coins;
  }
  save = { ...save, stats: st, runInProgress: null };
  save = grantReward(save, { coins: rewards.coins, gems: rewards.gems, keys: r.stats.keys });
  if (save.keys >= KEYS_PER_CHEST) rewards.keyChestReady = true;

  if (r.mode === 'campaign' && r.won) {
    const prevWorld = worldOfLevel(r.level);
    save = { ...save, level: Math.max(save.level, r.level + 1) };
    // Chest meter
    let progress = save.chest.progress + 1;
    let basic = save.chest.basic;
    if (progress >= CHEST_WINS) {
      progress = 0;
      basic++;
      rewards.chestReady = true;
    }
    save = { ...save, chest: { ...save.chest, progress, basic } };
    // World transitions
    if (r.level % LEVELS_PER_WORLD === 0) {
      rewards.newWorld = prevWorld + 1;
      const skin = worldSkinFor(prevWorld + 1);
      // The themed skin of world N is earned by *reaching* world N.
      if (skin && !save.skins.owned.includes(skin)) {
        save = grantReward(save, { skin });
        rewards.worldSkin = skin;
      }
    }
  }

  if (r.mode === 'daily' && r.won) {
    const dk = dayKey(now);
    const dc = save.dailyChallenge.dayKey === dk ? save.dailyChallenge : { dayKey: dk, best: 0, completed: false };
    if (!dc.completed) {
      save = grantReward(save, { gems: 10, keys: 1 });
      rewards.gems += 10;
      rewards.keys += 1;
    }
    save = { ...save, dailyChallenge: { dayKey: dk, best: Math.max(dc.best, r.finishCount), completed: true } };
  }

  // Missions
  const delta: MetricDelta = {
    runs: 1,
    wins: r.won ? 1 : 0,
    gates: r.stats.gatesTaken,
    multipliers: r.stats.multipliersTaken,
    bigMultipliers: r.stats.bigMultipliers,
    peakCrowd: r.stats.peak,
    finishCrowd: r.won ? r.finishCount : 0,
    coinsEarned: rewards.coins,
    rivalsDefeated: r.stats.rivalsDefeated,
    stragglers: r.stats.stragglers,
    perfect: r.perfect ? 1 : 0,
    challenges: rewards.challengeDone ? 1 : 0,
    topStall: r.won && r.stallIndex >= 9 ? 1 : 0,
    people: r.won ? r.finishCount : 0,
  };
  save = applyMissionDelta(save, delta);
  rewards.completedMissions = countNewlyCompleted(save0, save);
  return { save, rewards };
}

function applyMissionDelta(save: SaveData, delta: MetricDelta): SaveData {
  const d = applyMetrics(save.missions.daily, delta);
  const w = applyMetrics(save.missions.weekly, delta);
  return { ...save, missions: { ...save.missions, daily: d.list, weekly: w.list } };
}

function countNewlyCompleted(a: SaveData, b: SaveData): number {
  const done = (s: SaveData) => [...s.missions.daily, ...s.missions.weekly].filter((m) => m.progress >= m.target).length;
  return Math.max(0, done(b) - done(a));
}

/** Rewarded ad "Triple coins" on the victory screen. */
export function applyAdBonus(save: SaveData, bonus: number): SaveData {
  return grantReward(save, { coins: bonus });
}

export function claimMission(save: SaveData, id: string): { save: SaveData; reward: Reward } | null {
  for (const key of ['daily', 'weekly'] as const) {
    const list = save.missions[key];
    const idx = list.findIndex((m) => m.id === id);
    if (idx < 0) continue;
    const m = list[idx];
    if (m.claimed || m.progress < m.target) return null;
    const next = [...list];
    next[idx] = { ...m, claimed: true };
    const s = { ...save, missions: { ...save.missions, [key]: next } };
    return { save: grantReward(s, m.reward), reward: m.reward };
  }
  return null;
}

export function claimAchievement(save: SaveData, id: string): { save: SaveData; reward: Reward } | null {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return null;
  const st = achievementState(save, a);
  if (!st.claimable) return null;
  const s = { ...save, missions: { ...save.missions, achievements: { ...save.missions.achievements, [id]: st.tier + 1 } } };
  return { save: grantReward(s, st.reward), reward: st.reward };
}

/** Opens one stored chest (or the key chest). */
export function openChest(save: SaveData, source: ChestTier | 'keys'): { save: SaveData; reward: Reward; tier: ChestTier } | null {
  let s = save;
  let tier: ChestTier;
  if (source === 'keys') {
    if (s.keys < KEYS_PER_CHEST) return null;
    s = { ...s, keys: s.keys - KEYS_PER_CHEST };
    tier = 'basic';
  } else {
    if (s.chest[source] <= 0) return null;
    s = { ...s, chest: { ...s.chest, [source]: s.chest[source] - 1 } };
    tier = source;
  }
  const reward = rollChest(s, tier);
  s = { ...s, stats: { ...s.stats, chestsOpened: s.stats.chestsOpened + 1 } };
  s = grantReward(s, reward);
  s = applyMissionDelta(s, { chestsOpened: 1 });
  return { save: s, reward, tier };
}

export function buyUpgrade(save: SaveData, id: UpgradeId): SaveData | null {
  const lvl = save.upgrades[id];
  if (lvl >= UPGRADE_MAX[id]) return null;
  const cost = upgradeCost(id, lvl);
  if (save.coins < cost) return null;
  return { ...save, coins: save.coins - cost, upgrades: { ...save.upgrades, [id]: lvl + 1 } };
}

export function buySkin(save: SaveData, id: string): SaveData | null {
  const skin = skinById(id);
  if (skin.id !== id || save.skins.owned.includes(id)) return null;
  const u = skin.unlock;
  if (u.type === 'coins') {
    if (save.coins < u.price) return null;
    return { ...save, coins: save.coins - u.price, skins: { ...save.skins, owned: [...save.skins.owned, id] } };
  }
  if (u.type === 'gems') {
    if (save.gems < u.price) return null;
    return { ...save, gems: save.gems - u.price, skins: { ...save.skins, owned: [...save.skins.owned, id] } };
  }
  return null;
}

export function selectSkin(save: SaveData, id: string): SaveData {
  if (!save.skins.owned.includes(id)) return save;
  return { ...save, skins: { ...save.skins, selected: id } };
}

export function spendGems(save: SaveData, n: number): SaveData | null {
  if (save.gems < n) return null;
  return { ...save, gems: save.gems - n };
}

/* ---------------- Daily challenge ---------------- */

const DAILY_MUTATORS: MutatorId[] = ['rushHour', 'mystery', 'rivalry', 'windy', 'butterfingers', 'tight'];

/** Today's special level: seeded by the date, scaled to the player's level. */
export function dailyChallengeLevel(save: SaveData, now: number): LevelDef {
  const dk = dayKey(now);
  const h = hashString('daily-' + dk);
  const base = Math.max(8, save.level + 5);
  const m1 = DAILY_MUTATORS[h % DAILY_MUTATORS.length];
  const m2 = DAILY_MUTATORS[(h >>> 8) % DAILY_MUTATORS.length];
  const extra = m1 === m2 ? [m1] : [m1, m2];
  const def = generateLevel(base, { seed: h, extraMutators: extra });
  return { ...def, challenge: undefined };
}

export function dailyChallengeStatus(save: SaveData, now: number) {
  const dk = dayKey(now);
  const today = save.dailyChallenge.dayKey === dk;
  return { completed: today && save.dailyChallenge.completed, best: today ? save.dailyChallenge.best : 0 };
}
