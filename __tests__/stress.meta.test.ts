/**
 * Meta-progression stress tests: save fuzzing/corruption, a "monkey player"
 * performing thousands of random actions with invariants after each one,
 * calendars across time zones and DST, clock tampering, ads and IAP timelines.
 */
import { checksum, decodeSave, defaultSave, encodeSave, migrateSave, sanitizeSave, SAVE_VERSION, type SaveData } from '../src/meta/save';
import { claimDaily, dailyRewardFor, dailyStatus } from '../src/meta/daily';
import { ACHIEVEMENTS, achievementState, countClaimable, refreshMissions } from '../src/meta/missions';
import {
  applyAdBonus, applyRunResult, buySkin, buyUpgrade, claimAchievement, claimMission, dailyChallengeStatus, evaluateChallenge,
  openChest, selectSkin, spendGems, type RunResult,
} from '../src/meta/progression';
import { rollChest } from '../src/meta/chests';
import { dayDiff, dayKey, msUntilNextWeek, msUntilTomorrow, weekKey, isValidDayKey } from '../src/meta/time';
import { defeatCoins, levelBase, upgradeCost, UPGRADE_MAX, victoryCoins, reviveCount, freeCoinsAmount, gemPackCoins } from '../src/meta/economy';
import { SKINS, chestSkinPool, isSkinId, skinById } from '../src/meta/skins';
import { DEFAULT_AD_POLICY, recordInterstitialShown, recordRewardedShown, recordRunForAds, shouldShowInterstitial } from '../src/services/ads/policy';
import { grantPurchase, PRODUCTS, productById, restoreEntitlements } from '../src/services/iap/catalog';
import { execFileSync } from 'child_process';
import path from 'path';
import { findNonFinite, mutateTree, randomValue, range, Rng } from '../test-utils/fuzz';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 4, 10).getTime();

/** JSON with sorted keys (key order is irrelevant for a save). */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

function deepDiff(a: unknown, b: unknown, path = '$'): string {
  if (canon(a) === canon(b)) return '';
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = deepDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path}: ${JSON.stringify(a)?.slice(0, 120)} vs ${JSON.stringify(b)?.slice(0, 120)}`;
}

/** A save is "healthy" when the sanitizer would not change anything. */
function expectHealthy(s: SaveData, ctx = '') {
  const bad = findNonFinite(s);
  if (bad) throw new Error(`${ctx}: non-finite at ${bad}`);
  const clean = sanitizeSave(JSON.parse(JSON.stringify(s)), s.updatedAt);
  const a = canon(s), b = canon(clean);
  if (a !== b) {
    // Find the first differing path for a readable error.
    throw new Error(`${ctx}: not sanitizer-stable at ${deepDiff(JSON.parse(a), JSON.parse(b))}`);
  }
  if (s.coins < 0 || s.gems < 0 || s.keys < 0) throw new Error(`${ctx}: negative currency`);
  if (!s.skins.owned.includes(s.skins.selected)) throw new Error(`${ctx}: selected skin not owned`);
  if (new Set(s.skins.owned).size !== s.skins.owned.length) throw new Error(`${ctx}: duplicate skins`);
  for (const m of [...s.missions.daily, ...s.missions.weekly]) if (m.progress > m.target) throw new Error(`${ctx}: mission overflow`);
}

const stats = (rng: Rng) => {
  const peak = rng.int(1, 5000);
  return {
    gatesTaken: rng.int(0, 30), harmfulGates: rng.int(0, 5), multipliersTaken: rng.int(0, 10), maxMultiplier: rng.pick([1, 2, 3, 5, 10]),
    bigMultipliers: rng.int(0, 4), peak, lost: rng.int(0, peak), gained: rng.int(0, peak), coins: rng.int(0, 40), keys: rng.int(0, 1),
    rivalsDefeated: rng.int(0, 3), stragglers: rng.int(0, 200),
  };
};

function randomRun(rng: Rng, s: SaveData): RunResult {
  const won = rng.chance(0.65);
  const stallIndex = won ? rng.int(0, 9) : -1;
  return {
    mode: rng.chance(0.15) ? 'daily' : 'campaign',
    level: rng.chance(0.9) ? s.level : rng.int(1, s.level + 3),
    won,
    finishCount: won ? rng.int(1, 4000) : 0,
    multiplier: won ? [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 7, 10][stallIndex] : 1,
    stallIndex,
    perfect: won && stallIndex === 9 && rng.chance(0.5),
    progress: won ? 1 : rng.next(),
    stats: stats(rng),
    revived: rng.chance(0.2),
    challenge: rng.chance(0.3) ? { kind: rng.pick(['finishWith', 'maxLoss', 'noDivide', 'bigMultiplier', 'peak'] as const), target: rng.int(0, 500), rewardGems: rng.int(1, 10) } : undefined,
  };
}

/* ------------------------------------------------------------------ */

describe('save codec fuzzing', () => {
  it.each(range(1, 25))('seed %i: 200 mutated saves never crash and always sanitize to a healthy save', (seed) => {
    const rng = new Rng(seed * 1009);
    for (let i = 0; i < 200; i++) {
      const base = JSON.parse(JSON.stringify({ ...defaultSave(NOW), level: rng.int(1, 999), coins: rng.int(0, 1e6) }));
      const mutated = mutateTree(rng, base, rng.range(0.02, 0.4));
      const s = migrateSave(mutated, NOW);
      expectHealthy(s, `seed ${seed}#${i}`);
      // Encode → decode is lossless for any sanitized save.
      expect(decodeSave(encodeSave(s), NOW)).toEqual(s);
    }
  });
  it.each(range(1, 10))('seed %i: 300 totally random values are survivable', (seed) => {
    const rng = new Rng(seed * 77);
    for (let i = 0; i < 300; i++) {
      const v = randomValue(rng);
      expectHealthy(migrateSave(v, NOW), `rand ${seed}#${i}`);
      expectHealthy(sanitizeSave(v, NOW), `rand ${seed}#${i}`);
      expect(decodeSave(typeof v === 'string' ? v : JSON.stringify(v ?? null), NOW) === null || true).toBe(true);
    }
  });
  it('byte-level corruption of an envelope is always detected or harmless', () => {
    const rng = new Rng(4242);
    const s = { ...defaultSave(NOW), level: 321, coins: 98765, gems: 432 };
    const txt = encodeSave(s);
    let detected = 0;
    for (let i = 0; i < 3000; i++) {
      const pos = rng.int(0, txt.length - 1);
      const ch = String.fromCharCode(rng.int(32, 126));
      const bad = txt.slice(0, pos) + ch + txt.slice(pos + 1);
      if (bad === txt) continue;
      const d = decodeSave(bad, NOW);
      if (d === null) detected++;
      else expectHealthy(d, 'byte flip'); // whitespace / equivalent JSON
    }
    expect(detected).toBeGreaterThan(2800);
  });
  it('truncation at every length is detected', () => {
    const txt = encodeSave({ ...defaultSave(NOW), level: 50 });
    for (let n = 0; n < txt.length; n++) expect(decodeSave(txt.slice(0, n), NOW)).toBeNull();
  });
  it('prototype pollution payloads are inert', () => {
    const evil = JSON.parse('{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"level":5,"missions":{"achievements":{"__proto__":{"x":1}}},"skins":{"owned":["__proto__","rookie"]}}');
    const s = migrateSave(evil, NOW);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(s.level).toBe(5);
    expectHealthy(s, 'proto');
  });
  it('a save from a newer app version is kept, not wiped', () => {
    const s = migrateSave({ ...defaultSave(NOW), version: SAVE_VERSION + 5, level: 88, coins: 7 }, NOW);
    expect(s.level).toBe(88);
    expect(s.version).toBe(SAVE_VERSION);
  });
  it.each([
    ['coins', 1e30], ['gems', -5], ['level', 1e15], ['keys', 1e9], ['seenWorlds', -1], ['createdAt', -1],
  ] as const)('out-of-range %s=%p is clamped', (k, v) => {
    const s = sanitizeSave({ ...defaultSave(NOW), [k]: v }, NOW);
    expectHealthy(s, k);
  });
  it('checksum differs for 50k different random strings', () => {
    const rng = new Rng(1);
    const seen = new Map<string, string>();
    let collisions = 0;
    for (let i = 0; i < 50_000; i++) {
      const str = JSON.stringify({ a: rng.int(0, 1e9), b: rng.next() });
      const c = checksum(str);
      if (seen.has(c) && seen.get(c) !== str) collisions++;
      seen.set(c, str);
    }
    expect(collisions).toBeLessThan(3);
  });
  it('sanitize is idempotent on 2000 fuzzed saves', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 2000; i++) {
      const a = sanitizeSave(mutateTree(rng, JSON.parse(JSON.stringify(defaultSave(NOW))), 0.2), NOW);
      expect(sanitizeSave(JSON.parse(JSON.stringify(a)), NOW)).toEqual(a);
    }
  });
});

/* ------------------------------------------------------------------ */

describe('monkey player: thousands of random meta actions', () => {
  it.each(range(1, 40))('player %i: 400 random actions keep the save healthy', (seed) => {
    const rng = new Rng(seed * 2027);
    let now = NOW + rng.int(0, 365) * DAY;
    let s = refreshMissions(defaultSave(now), now);
    let gemsGrantedByIap = 0;
    for (let step = 0; step < 400; step++) {
      const action = rng.int(0, 15);
      const ctx = `player ${seed} step ${step} action ${action}`;
      // Time moves forward mostly, sometimes jumps, sometimes rolls back.
      const dtRoll = rng.next();
      now += dtRoll < 0.7 ? rng.int(0, 600_000) : dtRoll < 0.9 ? rng.int(1, 3) * DAY : dtRoll < 0.97 ? -rng.int(1, 3) * DAY : rng.int(10, 400) * DAY;
      const before = s;
      switch (action) {
        case 0: case 1: case 2: case 3: {
          const r = applyRunResult(s, randomRun(rng, s), now);
          expect(r.rewards.coins).toBeGreaterThanOrEqual(1);
          expect(findNonFinite(r.rewards)).toBeNull();
          s = r.save;
          break;
        }
        case 4: {
          const c = claimDaily(s, now);
          if (c) {
            s = c.save;
            if (c.reward.coins) s = { ...s, coins: s.coins + c.reward.coins };
          }
          break;
        }
        case 5: {
          const all = [...s.missions.daily, ...s.missions.weekly];
          const m = all.length ? rng.pick(all) : null;
          const c = m ? claimMission(s, rng.chance(0.1) ? 'nope' : m.id) : null;
          if (c) {
            expect(claimMission(c.save, m!.id)).toBeNull();
            s = c.save;
          }
          break;
        }
        case 6: {
          const a = rng.pick(ACHIEVEMENTS);
          const c = claimAchievement(s, a.id);
          if (c) s = c.save;
          break;
        }
        case 7: {
          const c = openChest(s, rng.pick(['basic', 'epic', 'keys'] as const));
          if (c) {
            expect(c.save.stats.chestsOpened).toBe(s.stats.chestsOpened + 1);
            s = c.save;
          }
          break;
        }
        case 8: {
          const id = rng.pick(['startCrowd', 'income'] as const);
          const n = buyUpgrade(s, id);
          if (n) {
            expect(n.coins).toBe(s.coins - upgradeCost(id, s.upgrades[id]));
            s = n;
          }
          break;
        }
        case 9: {
          const n = buySkin(s, rng.pick(SKINS).id);
          if (n) s = n;
          break;
        }
        case 10:
          s = selectSkin(s, rng.chance(0.2) ? 'ghost-not-owned' : rng.pick(s.skins.owned));
          break;
        case 11: {
          const n = spendGems(s, rng.int(0, 30));
          if (n) s = n;
          break;
        }
        case 12: {
          const p = rng.pick(PRODUCTS);
          const tx = 'tx' + rng.int(0, 60);
          const g = grantPurchase(s, p.id, tx);
          if (g.granted && p.type === 'consumable') gemsGrantedByIap += p.grant.gems ?? 0;
          s = g.save;
          break;
        }
        case 13:
          s = applyAdBonus(s, rng.int(0, 500));
          break;
        case 14: {
          // App restart: encode → decode.
          const d = decodeSave(encodeSave(s), now);
          expect(d).toEqual(s);
          break;
        }
        case 15:
          s = refreshMissions(s, now);
          break;
      }
      s = { ...s, updatedAt: Math.max(0, now) };
      expectHealthy(s, ctx);
      expect(s.level).toBeGreaterThanOrEqual(before.level);
      expect(s.purchases.removeAds || !before.purchases.removeAds).toBe(true);
      expect(s.stats.runs).toBeGreaterThanOrEqual(before.stats.runs);
      for (const id of before.skins.owned) expect(s.skins.owned).toContain(id);
    }
    expect(gemsGrantedByIap).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------ */

const ZONES = ['UTC', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'Asia/Tokyo', 'Pacific/Auckland', 'America/Sao_Paulo', 'Asia/Kolkata', 'Pacific/Chatham', 'Europe/London', 'America/St_Johns'];

/**
 * Jest workers ignore a runtime change of process.env.TZ, so each time zone runs
 * test-utils/calendarCheck.ts in its own process with TZ set before startup.
 */
describe('calendar across time zones and DST (separate process per zone)', () => {
  it.each(ZONES)('%s', (zone) => {
    const tsx = path.join(__dirname, '..', 'node_modules', '.bin', 'tsx');
    const out = execFileSync(tsx, [path.join(__dirname, '..', 'test-utils', 'calendarCheck.ts')], {
      env: { ...process.env, TZ: zone },
      encoding: 'utf8',
      timeout: 120_000,
    });
    expect(out.trim()).toBe(`OK ${zone}`);
  });
});

describe('clock tampering', () => {
  it.each([1, 2, 3, 5, 7])('rolling the clock back %i day(s) never grants a second daily reward', (n) => {
    let s = claimDaily(defaultSave(NOW), NOW)!.save;
    expect(claimDaily(s, NOW - n * DAY)).toBeNull();
    s = claimDaily(s, NOW + DAY)!.save;
    expect(claimDaily(s, NOW + DAY - n * DAY)).toBeNull();
  });
  it('a player whose clock was once far in the future is not locked out for years', () => {
    const future = NOW + 4 * 365 * DAY;
    let s = claimDaily(defaultSave(NOW), future)!.save; // wrong clock, then fixed
    s = refreshMissions(s, future);
    const c = claimDaily(s, NOW);
    expect(c).not.toBeNull();
    const m = refreshMissions(s, NOW);
    expect(m.missions.dailyKey).toBe(dayKey(NOW));
    expect(m.missions.weeklyKey).toBe(weekKey(NOW));
  });
  it('a corrupted weekly key does not freeze weekly missions', () => {
    const s = sanitizeSave({ ...defaultSave(NOW), missions: { ...defaultSave(NOW).missions, weeklyKey: 'zzzz' } }, NOW);
    expect(refreshMissions(s, NOW).missions.weeklyKey).toBe(weekKey(NOW));
  });
  it('interstitials resume after the clock was set back (no permanent ad freeze, no ad spam)', () => {
    let s = { ...defaultSave(NOW), level: 20 };
    s = recordInterstitialShown(s, NOW + 365 * DAY); // shown while the clock was wrong
    for (let i = 0; i < 3; i++) s = recordRunForAds(s);
    expect(shouldShowInterstitial(s, NOW)).toBe(true);
    s = recordInterstitialShown(s, NOW);
    expect(shouldShowInterstitial(s, NOW + 1000)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe('ads policy timelines', () => {
  it.each(range(1, 20))('session %i: never two interstitials within cooldown, never < 3 runs apart', (seed) => {
    const rng = new Rng(seed * 13);
    let now = NOW;
    let s = { ...defaultSave(NOW), level: rng.int(1, 30) };
    let lastShown = -Infinity;
    let runsSince = 0;
    let shown = 0;
    for (let i = 0; i < 500; i++) {
      now += rng.int(5_000, 120_000);
      s = recordRunForAds(s);
      runsSince++;
      if (rng.chance(0.4)) s = { ...s, level: s.level + 1 };
      if (rng.chance(0.1)) {
        s = recordRewardedShown(s, now);
        runsSince = 0;
        lastShown = now;
      }
      if (rng.chance(0.003)) s = { ...s, purchases: { ...s.purchases, removeAds: true } };
      const suppress = rng.chance(0.1);
      if (shouldShowInterstitial(s, now, { suppress })) {
        expect(s.purchases.removeAds).toBe(false);
        expect(suppress).toBe(false);
        expect(s.level).toBeGreaterThanOrEqual(DEFAULT_AD_POLICY.minLevel);
        expect(now - lastShown).toBeGreaterThanOrEqual(DEFAULT_AD_POLICY.cooldownMs);
        expect(runsSince).toBeGreaterThanOrEqual(DEFAULT_AD_POLICY.everyLevels);
        s = recordInterstitialShown(s, now);
        lastShown = now;
        runsSince = 0;
        shown++;
      }
    }
    expect(shown).toBeLessThan(500 / DEFAULT_AD_POLICY.everyLevels + 1);
  });
});

describe('IAP fuzzing', () => {
  it.each(range(1, 15))('seed %i: replays, duplicates and restores never double-grant', (seed) => {
    const rng = new Rng(seed * 101);
    let s = defaultSave(NOW);
    const granted = new Set<string>();
    let expectedGems = 0;
    let starter = false;
    for (let i = 0; i < 300; i++) {
      const r = rng.next();
      if (r < 0.75) {
        const p = rng.chance(0.05) ? { id: 'com.evil.unknown', type: 'consumable', grant: { gems: 999 } } : rng.pick(PRODUCTS);
        const tx = 'T' + rng.int(0, 150);
        const g = grantPurchase(s, p.id, tx);
        if (g.granted) {
          expect(granted.has(tx)).toBe(false);
          expect(productById(p.id)).toBeDefined();
          granted.add(tx);
          if (p.id.endsWith('starterpack')) {
            expect(starter).toBe(false);
            starter = true;
            expectedGems += 150;
          } else expectedGems += (p.grant as { gems?: number }).gems ?? 0;
        }
        s = g.save;
      } else {
        const owned = PRODUCTS.filter(() => rng.chance(0.5)).map((p) => p.id);
        const before = s.gems;
        s = restoreEntitlements(s, owned);
        expect(s.gems).toBe(before); // restore never grants consumables
      }
      expect(s.gems).toBe(expectedGems);
      expect(s.purchases.processed.length).toBeLessThanOrEqual(200);
      expectHealthy(s, `iap ${seed}#${i}`);
    }
  });
  it('the starter pack grants Remove Ads + golden skin exactly once, restore re-grants entitlements only', () => {
    const starter = PRODUCTS.find((p) => p.key === 'starter')!;
    const a = grantPurchase(defaultSave(NOW), starter.id, 'x').save;
    const r = restoreEntitlements(defaultSave(NOW), [starter.id, starter.id]);
    expect(r.purchases.removeAds && r.purchases.starter).toBe(true);
    expect(r.skins.owned).toContain('golden');
    expect(r.gems).toBe(0);
    expect(a.gems).toBe(150);
  });
});

/* ------------------------------------------------------------------ */

describe('economy', () => {
  it.each(range(0, 9).map((e) => 10 ** e))('rewards at level %i are finite, positive and sane', (L) => {
    expect(levelBase(L)).toBeGreaterThan(0);
    for (const f of [0, 1, 50, 10_000, 9_999_999]) for (const m of [1, 2, 10]) for (const inc of [0, 25, 50]) {
      const v = victoryCoins(L, f, m, inc);
      expect(Number.isInteger(v) && v >= 1).toBe(true);
    }
    for (const p of [-1, 0, 0.5, 1, 2, NaN]) expect(Number.isFinite(defeatCoins(L, p, 10)) ? defeatCoins(L, p, 10) >= 1 : false).toBe(true);
    expect(freeCoinsAmount(L)).toBeGreaterThan(0);
    expect(gemPackCoins(12, L)).toBeGreaterThan(0);
  });
  it('victory coins are monotonic in finish count, multiplier and income', () => {
    for (let f = 1; f < 5000; f += 37) expect(victoryCoins(50, f + 37, 2, 0)).toBeGreaterThanOrEqual(victoryCoins(50, f, 2, 0));
    const ms = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 7, 10];
    for (let i = 1; i < ms.length; i++) expect(victoryCoins(50, 100, ms[i], 0)).toBeGreaterThanOrEqual(victoryCoins(50, 100, ms[i - 1], 0));
    for (let i = 1; i <= UPGRADE_MAX.income; i++) expect(victoryCoins(50, 100, 2, i)).toBeGreaterThanOrEqual(victoryCoins(50, 100, 2, i - 1));
  });
  it('upgrade costs strictly increase up to the max level and stay finite', () => {
    for (const id of ['startCrowd', 'income'] as const) {
      for (let l = 1; l <= UPGRADE_MAX[id]; l++) {
        expect(upgradeCost(id, l)).toBeGreaterThan(upgradeCost(id, l - 1));
        expect(Number.isFinite(upgradeCost(id, l))).toBe(true);
      }
    }
  });
  it('a maxed upgrade cannot be bought', () => {
    const s = { ...defaultSave(NOW), coins: 1e12, upgrades: { startCrowd: UPGRADE_MAX.startCrowd, income: UPGRADE_MAX.income } };
    expect(buyUpgrade(s, 'startCrowd')).toBeNull();
    expect(buyUpgrade(s, 'income')).toBeNull();
  });
  it('revive count is at least 10 and grows with the peak', () => {
    for (let p = 0; p < 10_000; p += 7) {
      expect(reviveCount(p)).toBeGreaterThanOrEqual(10);
      expect(reviveCount(p + 7)).toBeGreaterThanOrEqual(reviveCount(p));
    }
  });
  it('1000 simulated days of play keep the economy within sane bounds', () => {
    const rng = new Rng(2);
    let s = defaultSave(NOW);
    for (let d = 0; d < 1000; d++) {
      for (let r = 0; r < 8; r++) s = applyRunResult(s, { ...randomRun(rng, s), mode: 'campaign', level: s.level }, NOW + d * DAY).save;
    }
    expect(s.level).toBeGreaterThan(1000);
    // A typical skin price must stay meaningful but reachable.
    expect(s.coins).toBeLessThan(1e9);
  });
});

describe('chests', () => {
  it.each(['basic', 'epic'] as const)('%s chest rolls are deterministic, valid and never give owned skins', (tier) => {
    const rng = new Rng(tier.length);
    for (let i = 0; i < 2000; i++) {
      const owned = SKINS.filter(() => rng.chance(0.5)).map((x) => x.id);
      const s = { ...defaultSave(NOW + i), level: rng.int(1, 5000), skins: { owned: ['rookie', ...owned], selected: 'rookie' }, stats: { ...defaultSave(NOW).stats, chestsOpened: rng.int(0, 999) } };
      const r = rollChest(s, tier);
      expect(rollChest(s, tier)).toEqual(r);
      expect(r.coins).toBeGreaterThan(0);
      if (r.skin) {
        expect(isSkinId(r.skin)).toBe(true);
        expect(s.skins.owned).not.toContain(r.skin);
        expect(chestSkinPool(tier).map((x) => x.id)).toContain(r.skin);
      }
      if (tier === 'epic') expect(r.gems).toBeGreaterThan(0);
    }
  });
  it('opening every chest eventually collects all chest skins', () => {
    let s = { ...defaultSave(NOW), chest: { progress: 0, basic: 0, epic: 400 } };
    for (let i = 0; i < 400; i++) s = openChest(s, 'epic')!.save;
    for (const k of chestSkinPool('epic')) expect(s.skins.owned).toContain(k.id);
    expect(openChest(s, 'epic')).toBeNull();
  });
});

describe('missions & achievements', () => {
  it.each(range(1, 60))('level %i: mission sets are valid and reachable', (L) => {
    const s = refreshMissions({ ...defaultSave(NOW), level: L * 7 }, NOW + L * DAY);
    expect(s.missions.daily).toHaveLength(3);
    expect(s.missions.weekly).toHaveLength(3);
    const ids = [...s.missions.daily, ...s.missions.weekly].map((m) => m.id);
    expect(new Set(ids).size).toBe(6);
    for (const m of [...s.missions.daily, ...s.missions.weekly]) {
      expect(m.target).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(m.target)).toBe(true);
      expect(Object.keys(m.reward).length).toBeGreaterThan(0);
    }
  });
  it('achievement targets are strictly increasing for 60 tiers and rewards are valid', () => {
    for (const a of ACHIEVEMENTS) {
      for (let t = 1; t < 60; t++) {
        expect(a.target(t)).toBeGreaterThan(a.target(t - 1));
        expect(Number.isFinite(a.target(t))).toBe(true);
        const r = a.reward(t);
        expect(findNonFinite(r)).toBeNull();
        expect(Object.keys(r).length).toBeGreaterThan(0);
      }
    }
  });
  it('claiming achievements in a loop terminates and tiers only go up', () => {
    let s = { ...defaultSave(NOW), level: 5000, stats: { ...defaultSave(NOW).stats, bestCrowd: 1e6, people: 1e8, rivalsDefeated: 5000, bigMultipliers: 9000, chestsOpened: 900, challenges: 900, perfect: 900 } };
    let claims = 0;
    for (const a of ACHIEVEMENTS) {
      let c;
      while ((c = claimAchievement(s, a.id))) {
        s = c.save;
        claims++;
        expect(claims).toBeLessThan(2000);
      }
      expect(achievementState(s, a).claimable).toBe(false);
    }
    expect(countClaimable(s)).toBe(0);
    expectHealthy({ ...s, updatedAt: NOW }, 'achievements');
  });
  it('claimAchievement on an unknown id is null', () => {
    expect(claimAchievement(defaultSave(NOW), 'nope')).toBeNull();
  });
});

describe('challenges', () => {
  it('evaluateChallenge requires a win and checks each kind', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 5000; i++) {
      const r = randomRun(rng, defaultSave(NOW));
      const c = r.challenge;
      const ok = evaluateChallenge(c, r);
      if (!c || !r.won) expect(ok).toBe(false);
      else {
        const expected = { finishWith: r.finishCount >= c.target, maxLoss: r.stats.lost <= c.target, noDivide: r.stats.harmfulGates === 0, bigMultiplier: r.stats.maxMultiplier >= c.target, peak: r.stats.peak >= c.target }[c.kind];
        expect(ok).toBe(expected);
      }
    }
  });
  it('daily challenge rewards only once per day, even after a restart', () => {
    let s = { ...defaultSave(NOW), level: 30 };
    const run = (): RunResult => ({ mode: 'daily', level: 35, won: true, finishCount: 50, multiplier: 2, stallIndex: 3, perfect: false, progress: 1, stats: stats(new Rng(1)), revived: false });
    s = applyRunResult(s, run(), NOW).save;
    const gems = s.gems;
    s = decodeSave(encodeSave(s), NOW)!;
    s = applyRunResult(s, run(), NOW + 3600_000).save;
    expect(s.gems).toBe(gems);
    expect(dailyChallengeStatus(s, NOW).completed).toBe(true);
    expect(dailyChallengeStatus(s, NOW + DAY).completed).toBe(false);
    expect(s.level).toBe(30);
  });
});

describe('skins catalog', () => {
  it.each(SKINS.map((x) => [x.id, x] as const))('skin %s is valid', (_id, sk) => {
    for (const c of [sk.body, sk.legs, sk.skin, sk.accColor]) expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(sk.name.en.length).toBeGreaterThan(1);
    expect(sk.name.fr.length).toBeGreaterThan(1);
    if (sk.unlock.type === 'coins' || sk.unlock.type === 'gems') expect(sk.unlock.price).toBeGreaterThan(0);
    if (sk.unlock.type === 'world') expect(sk.unlock.world).toBeGreaterThanOrEqual(2);
    expect(skinById(sk.id)).toBe(sk);
  });
  it('every world 2..8 awards exactly one skin', () => {
    for (let w = 2; w <= 8; w++) expect(SKINS.filter((s) => s.unlock.type === 'world' && s.unlock.world === w)).toHaveLength(1);
  });
  it('daily calendar rewards are valid for every day and level', () => {
    for (let d = 0; d < 21; d++) for (const L of [1, 10, 100, 1e6]) {
      const r = dailyRewardFor(d, L);
      expect(findNonFinite(r)).toBeNull();
      expect(Object.keys(r).length).toBeGreaterThan(0);
    }
    expect(dailyStatus(defaultSave(NOW), NOW).canClaim).toBe(true);
  });
});
