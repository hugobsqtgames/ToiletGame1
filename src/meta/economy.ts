import { niceRound } from '../core/math';

/** All economy formulas in one place (documented in docs/ECONOMY.md). */

export const UPGRADE_MAX = { startCrowd: 60, income: 50 } as const;
export type UpgradeId = keyof typeof UPGRADE_MAX;

export function upgradeCost(id: UpgradeId, currentLevel: number): number {
  const k = currentLevel;
  return id === 'startCrowd' ? niceRound(60 * Math.pow(1.3, k)) : niceRound(90 * Math.pow(1.36, k));
}

/** Extra starting members granted by the Start Crowd upgrade. */
export const startBonus = (lvl: number) => lvl * 2;
/** Coin multiplier from the Income upgrade. */
export const incomeMultiplier = (lvl: number) => 1 + 0.08 * lvl;

/** Base coin value of a level (grows slowly, no hard cap). */
export const levelBase = (level: number) => 20 + 2.2 * Math.pow(Math.max(1, level), 0.75);

/** Coins for a victory, before optional rewarded-ad tripling. */
export function victoryCoins(level: number, finishCount: number, multiplier: number, incomeLvl: number): number {
  const crowdFactor = 1 + 0.6 * Math.log2(1 + Math.max(0, finishCount) / 10);
  return Math.max(1, Math.round(levelBase(level) * crowdFactor * multiplier * incomeMultiplier(incomeLvl)));
}

/** Consolation coins after a defeat, proportional to distance travelled. */
export function defeatCoins(level: number, progress: number, incomeLvl: number): number {
  return Math.max(1, Math.round(levelBase(level) * 0.35 * Math.min(1, Math.max(0, progress)) * incomeMultiplier(incomeLvl)));
}

/** Members granted by the revive (second chance). */
export const reviveCount = (peak: number) => Math.max(10, Math.ceil(peak * 0.35));
/** Gem price of a revive (alternative to watching an ad). */
export const REVIVE_GEMS = 15;

/** Rewarded "free coins" button in the shop. */
export const FREE_COINS_PER_DAY = 5;
export const freeCoinsAmount = (level: number) => niceRound(60 + levelBase(level) * 3);

/** Gem → coin conversion packs offered in the shop. */
export const GEM_COIN_PACKS = [
  { id: 'coins_s', gems: 20, coinsFactor: 12 },
  { id: 'coins_m', gems: 60, coinsFactor: 40 },
  { id: 'coins_l', gems: 150, coinsFactor: 110 },
] as const;
export const gemPackCoins = (factor: number, level: number) => niceRound(factor * levelBase(level) * 2);

/** Victories needed to fill the chest meter. */
export const CHEST_WINS = 4;
/** Keys needed to open the key chest. */
export const KEYS_PER_CHEST = 3;
