import { niceRound } from '../core/math';
import type { Reward, SaveData } from './save';
import { dayDiff, dayKey } from './time';

/**
 * 7-day login calendar. Claiming on consecutive days advances the streak;
 * missing a day restarts at day 1 (best streak is kept for the profile).
 * Clock rollbacks (device date set in the past) cannot be exploited.
 */
export const DAILY_CYCLE = 7;

export function dailyRewardFor(dayIndex: number, level: number): Reward {
  const scale = 1 + Math.min(10, level / 40);
  switch (dayIndex % DAILY_CYCLE) {
    case 0: return { coins: niceRound(100 * scale) };
    case 1: return { coins: niceRound(150 * scale) };
    case 2: return { chest: 'basic' };
    case 3: return { gems: 5 };
    case 4: return { coins: niceRound(300 * scale) };
    case 5: return { keys: 2 };
    default: return { chest: 'epic', gems: 15 };
  }
}

export interface DailyStatus {
  canClaim: boolean;
  /** Index (0..6) of the reward that would be claimed now / next. */
  dayIndex: number;
  /** True when the streak was broken (next claim restarts at day 1). */
  broken: boolean;
}

export function dailyStatus(save: SaveData, now: number): DailyStatus {
  const today = dayKey(now);
  const last = save.daily.lastClaimDay;
  if (!last) return { canClaim: true, dayIndex: 0, broken: false };
  const diff = dayDiff(last, today);
  if (diff <= 0) return { canClaim: false, dayIndex: save.daily.streak % DAILY_CYCLE, broken: false };
  if (diff === 1) return { canClaim: true, dayIndex: save.daily.streak % DAILY_CYCLE, broken: false };
  return { canClaim: true, dayIndex: 0, broken: true };
}

/** Returns the updated save + the reward to grant, or null if not claimable. */
export function claimDaily(save: SaveData, now: number): { save: SaveData; reward: Reward; dayIndex: number } | null {
  const st = dailyStatus(save, now);
  if (!st.canClaim) return null;
  const streak = st.broken || !save.daily.lastClaimDay ? 1 : save.daily.streak + 1;
  const reward = dailyRewardFor(st.dayIndex, save.level);
  return {
    save: { ...save, daily: { lastClaimDay: dayKey(now), streak, bestStreak: Math.max(save.daily.bestStreak, streak) } },
    reward,
    dayIndex: st.dayIndex,
  };
}
