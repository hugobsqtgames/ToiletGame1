import type { SaveData } from '../../meta/save';

/**
 * Interstitial frequency policy. Pure and unit-tested.
 * Rules (all configurable):
 *  - never before `minLevel` (new players are never interrupted)
 *  - never if Remove Ads was purchased
 *  - at most once every `everyLevels` completed runs
 *  - at least `cooldownMs` between two interstitials
 *  - never right after a rewarded ad or a purchase (handled by the caller via `suppress`)
 *  - only shown between runs (results screen → next action), never during gameplay
 */
export interface AdPolicyConfig {
  minLevel: number;
  everyLevels: number;
  cooldownMs: number;
}

export const DEFAULT_AD_POLICY: AdPolicyConfig = {
  minLevel: 5,
  everyLevels: 3,
  cooldownMs: 120_000,
};

export function shouldShowInterstitial(save: SaveData, now: number, opts: { suppress?: boolean } = {}, cfg = DEFAULT_AD_POLICY): boolean {
  if (save.purchases.removeAds) return false;
  if (opts.suppress) return false;
  if (save.level < cfg.minLevel) return false;
  if (save.ads.levelsSinceInterstitial < cfg.everyLevels) return false;
  // A negative delay means the clock went back since the last ad (it was wrong at the
  // time): ignore it rather than freezing interstitials until that date.
  const since = now - save.ads.lastInterstitialAt;
  if (since >= 0 && since < cfg.cooldownMs) return false;
  return true;
}

export function recordRunForAds(save: SaveData): SaveData {
  return { ...save, ads: { ...save.ads, levelsSinceInterstitial: save.ads.levelsSinceInterstitial + 1 } };
}

export function recordInterstitialShown(save: SaveData, now: number): SaveData {
  return { ...save, ads: { ...save.ads, levelsSinceInterstitial: 0, lastInterstitialAt: now } };
}

/** Rewarded ads also reset the interstitial counter: never stack two ads. */
export const recordRewardedShown = recordInterstitialShown;

/**
 * Rewarded placements. Rewarded ads stay available after Remove Ads because
 * they are always opt-in and grant a bonus (stated clearly in the shop).
 */
export type RewardedPlacement = 'revive' | 'tripleCoins' | 'freeCoins';
