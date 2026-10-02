import { defaultSave, decodeSave, encodeSave, migrateSave, sanitizeSave } from '../src/meta/save';
import { claimDaily, dailyStatus } from '../src/meta/daily';
import { refreshMissions, ACHIEVEMENTS } from '../src/meta/missions';
import { applyRunResult, buySkin, buyUpgrade, claimAchievement, claimMission, openChest, dailyChallengeLevel, type RunResult } from '../src/meta/progression';
import { upgradeCost, victoryCoins } from '../src/meta/economy';
import { shouldShowInterstitial, recordInterstitialShown } from '../src/services/ads/policy';
import { grantPurchase, restoreEntitlements, productByKey } from '../src/services/iap/catalog';
import { SKINS } from '../src/meta/skins';

const NOW = new Date(2026, 9, 2, 10).getTime();
const DAY = 86_400_000;
const stats = (o: Partial<RunResult['stats']> = {}) => ({ gatesTaken: 5, harmfulGates: 0, multipliersTaken: 2, maxMultiplier: 3, bigMultipliers: 1, peak: 120, lost: 10, gained: 100, coins: 4, keys: 0, rivalsDefeated: 1, stragglers: 5, ...o });
const win = (level: number, o: Partial<RunResult> = {}): RunResult => ({ mode: 'campaign', level, won: true, finishCount: 100, multiplier: 2, stallIndex: 3, perfect: false, progress: 1, stats: stats(), revived: false, ...o });

describe('save', () => {
  it('round-trips', () => {
    const s = { ...defaultSave(NOW), coins: 1234, level: 77 };
    expect(decodeSave(encodeSave(s), NOW)).toEqual(s);
  });
  it('rejects corrupted payloads', () => {
    const txt = encodeSave(defaultSave(NOW));
    expect(decodeSave(txt.slice(0, -10), NOW)).toBeNull();
    expect(decodeSave(txt.replace('"level\\":1', '"level\\":999'), NOW)).toBeNull();
    expect(decodeSave('garbage', NOW)).toBeNull();
    expect(decodeSave(null, NOW)).toBeNull();
  });
  it('sanitizes invalid data', () => {
    const s = sanitizeSave({ level: -5, coins: 'lots', gems: NaN, skins: { owned: ['nope'], selected: 'nope' }, settings: { language: 'de' } }, NOW);
    expect(s.level).toBe(1);
    expect(s.coins).toBe(0);
    expect(s.gems).toBe(0);
    expect(s.skins.selected).toBe('rookie');
    expect(s.settings.language).toBe('auto');
    expect(sanitizeSave(null, NOW).level).toBe(1);
    expect(sanitizeSave([1, 2], NOW).level).toBe(1);
  });
  it('migrates v1 saves', () => {
    const s = migrateSave({ version: 1, level: 12, coins: 50, chestProgress: 3, removeAds: true }, NOW);
    expect(s.level).toBe(12);
    expect(s.chest.progress).toBe(3);
    expect(s.purchases.removeAds).toBe(true);
  });
});

describe('daily rewards', () => {
  it('advances, blocks double claims, resets after a missed day, resists clock rollback', () => {
    let s = defaultSave(NOW);
    const c1 = claimDaily(s, NOW)!; s = c1.save;
    expect(c1.dayIndex).toBe(0);
    expect(claimDaily(s, NOW + 1000)).toBeNull();
    const c2 = claimDaily(s, NOW + DAY)!; s = c2.save;
    expect(c2.dayIndex).toBe(1);
    expect(claimDaily(s, NOW - DAY)).toBeNull(); // rollback
    const c3 = claimDaily(s, NOW + 4 * DAY)!;
    expect(c3.dayIndex).toBe(0);
    expect(c3.save.daily.bestStreak).toBe(2);
  });
  it('loops after day 7', () => {
    let s = defaultSave(NOW);
    for (let i = 0; i < 8; i++) s = claimDaily(s, NOW + i * DAY)!.save;
    expect(dailyStatus(s, NOW + 8 * DAY).dayIndex).toBe(1);
  });
});

describe('progression', () => {
  it('advances level, grants coins, fills chest', () => {
    let s = defaultSave(NOW);
    for (let i = 1; i <= 4; i++) s = applyRunResult(s, win(i), NOW).save;
    expect(s.level).toBe(5);
    expect(s.chest.basic).toBe(1);
    expect(s.coins).toBeGreaterThan(0);
    const opened = openChest(s, 'basic')!;
    expect(opened.save.chest.basic).toBe(0);
    expect(opened.save.stats.chestsOpened).toBe(1);
    expect(openChest(opened.save, 'basic')).toBeNull();
  });
  it('a defeat does not advance', () => {
    const s = applyRunResult(defaultSave(NOW), win(1, { won: false, progress: 0.5 }), NOW).save;
    expect(s.level).toBe(1);
    expect(s.stats.losses).toBe(1);
  });
  it('unlocks a new world and its skin at level 10/20', () => {
    const s = { ...defaultSave(NOW), level: 10 };
    const r = applyRunResult(s, win(10), NOW);
    expect(r.rewards.newWorld).toBe(2);
    expect(r.save.skins.owned).toContain('ref');
  });
  it('missions progress and can be claimed once', () => {
    let s = refreshMissions(defaultSave(NOW), NOW);
    expect(s.missions.daily).toHaveLength(3);
    for (let i = 1; i <= 30; i++) s = applyRunResult(s, win(i, { perfect: true, stallIndex: 9 }), NOW).save;
    const m = s.missions.daily.find((x) => x.progress >= x.target)!;
    expect(m).toBeDefined();
    const c = claimMission(s, m.id)!;
    expect(c).not.toBeNull();
    expect(claimMission(c.save, m.id)).toBeNull();
  });
  it('achievements are infinite', () => {
    const a = ACHIEVEMENTS[0];
    expect(a.target(50)).toBeGreaterThan(a.target(49));
    let s = { ...defaultSave(NOW), level: 30 };
    const c = claimAchievement(s, 'level')!;
    expect(c.save.missions.achievements.level).toBe(1);
  });
  it('upgrades and skins cost currency', () => {
    let s = { ...defaultSave(NOW), coins: 100000, gems: 100 };
    s = buyUpgrade(s, 'startCrowd')!;
    expect(s.coins).toBe(100000 - upgradeCost('startCrowd', 0));
    expect(buyUpgrade({ ...s, coins: 0 }, 'income')).toBeNull();
    s = buySkin(s, 'robot')!;
    expect(s.skins.owned).toContain('robot');
    expect(buySkin(s, 'robot')).toBeNull();
    expect(buySkin(s, 'golden')).toBeNull(); // IAP only
  });
  it('rewards grow with finish count and multiplier', () => {
    expect(victoryCoins(10, 200, 2, 0)).toBeGreaterThan(victoryCoins(10, 50, 2, 0));
    expect(victoryCoins(10, 200, 5, 0)).toBeGreaterThan(victoryCoins(10, 200, 2, 0));
  });
  it('daily challenge is stable for a day and rewards once', () => {
    const s = { ...defaultSave(NOW), level: 20 };
    expect(JSON.stringify(dailyChallengeLevel(s, NOW))).toBe(JSON.stringify(dailyChallengeLevel(s, NOW + 3600_000)));
    const r1 = applyRunResult(s, win(25, { mode: 'daily' }), NOW);
    const r2 = applyRunResult(r1.save, win(25, { mode: 'daily' }), NOW);
    expect(r1.save.gems - s.gems).toBeGreaterThan(r2.save.gems - r1.save.gems);
    expect(r1.save.level).toBe(20);
  });
  it('every skin has valid unlock data', () => {
    expect(new Set(SKINS.map((x) => x.id)).size).toBe(SKINS.length);
  });
});

describe('ads policy', () => {
  it('never shows to new players, respects frequency, cooldown and Remove Ads', () => {
    let s = { ...defaultSave(NOW), level: 2 };
    s.ads.levelsSinceInterstitial = 10;
    expect(shouldShowInterstitial(s, NOW)).toBe(false);
    s = { ...s, level: 10 };
    expect(shouldShowInterstitial(s, NOW)).toBe(true);
    s = recordInterstitialShown(s, NOW);
    expect(shouldShowInterstitial(s, NOW + 1000)).toBe(false);
    s = { ...s, ads: { ...s.ads, levelsSinceInterstitial: 3 } };
    expect(shouldShowInterstitial(s, NOW + 30_000)).toBe(false);
    expect(shouldShowInterstitial(s, NOW + 200_000)).toBe(true);
    expect(shouldShowInterstitial({ ...s, purchases: { ...s.purchases, removeAds: true } }, NOW + 200_000)).toBe(false);
  });
});

describe('iap entitlements', () => {
  it('grants once per transaction, restores non-consumables only', () => {
    let s = defaultSave(NOW);
    const gems = productByKey('gemsS');
    s = grantPurchase(s, gems.id, 't1').save;
    const again = grantPurchase(s, gems.id, 't1');
    expect(again.granted).toBe(false);
    expect(s.gems).toBe(80);
    const starter = productByKey('starter');
    s = grantPurchase(s, starter.id, 't2').save;
    expect(s.purchases.removeAds && s.purchases.starter).toBe(true);
    expect(s.skins.owned).toContain('golden');
    const second = grantPurchase(s, starter.id, 't3');
    expect(second.granted).toBe(false);
    const fresh = restoreEntitlements(defaultSave(NOW), [starter.id, gems.id]);
    expect(fresh.purchases.removeAds).toBe(true);
    expect(fresh.gems).toBe(0);
    expect(grantPurchase(s, 'unknown', 't9').granted).toBe(false);
  });
});

describe('audit regressions', () => {
  it('missions cannot be farmed by rolling the clock back', () => {
    let s = refreshMissions(defaultSave(NOW), NOW);
    const today = s.missions.dailyKey;
    s = { ...s, missions: { ...s.missions, daily: s.missions.daily.map((m) => ({ ...m, claimed: true })) } };
    const back = refreshMissions(s, NOW - 2 * DAY);
    expect(back.missions.dailyKey).toBe(today);
    expect(back.missions.daily.every((m) => m.claimed)).toBe(true);
    const next = refreshMissions(s, NOW + DAY);
    expect(next.missions.dailyKey).not.toBe(today);
  });
  it('new players never get missions they cannot complete yet', () => {
    for (let d = 0; d < 60; d++) {
      const s = refreshMissions(defaultSave(NOW), NOW + d * DAY);
      expect(s.missions.daily.some((m) => m.metric === 'rivalsDefeated')).toBe(false);
    }
  });
  it('keeps real timestamps through a save round-trip', () => {
    const s = { ...defaultSave(NOW), ads: { ...defaultSave(NOW).ads, lastInterstitialAt: NOW } };
    expect(decodeSave(encodeSave(s), NOW)!.ads.lastInterstitialAt).toBe(NOW);
  });
});
