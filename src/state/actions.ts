import { AppState as RNAppState, BackHandler, PixelRatio, Platform } from 'react-native';
import { generateLevel } from '../core/levelGen';
import type { Simulation } from '../core/simulation';
import { getWorld, worldOfLevel } from '../core/worlds';
import { claimDaily as claimDailyPure } from '../meta/daily';
import { FREE_COINS_PER_DAY, GEM_COIN_PACKS, REVIVE_GEMS, freeCoinsAmount, gemPackCoins, reviveCount, startBonus, type UpgradeId } from '../meta/economy';
import { refreshMissions } from '../meta/missions';
import {
  applyAdBonus, applyRunResult, buySkin as buySkinPure, buyUpgrade as buyUpgradePure, claimAchievement as claimAchPure,
  claimMission as claimMissionPure, dailyChallengeLevel, grantReward, openChest as openChestPure, selectSkin as selectSkinPure, spendGems,
  type RunResult,
} from '../meta/progression';
import { defaultSave, type Reward, type SaveData } from '../meta/save';
import { skinById } from '../meta/skins';
import { dayKey } from '../meta/time';
import { ads } from '../services/ads/AdService';
import { recordInterstitialShown, recordRewardedShown, recordRunForAds, shouldShowInterstitial } from '../services/ads/policy';
import { analytics } from '../services/analytics';
import { audio } from '../services/audio';
import { haptics } from '../services/haptics';
import { iap } from '../services/iap/IapService';
import { grantPurchase, restoreEntitlements, type ProductKey } from '../services/iap/catalog';
import { log } from '../services/log';
import { loadSave, persistSave, wipeSave } from '../services/storage';
import { game, type QualityTier } from '../render/GameController';
import { setLanguage, t } from '../ui/i18n';
import { app, type ModalId } from './app';
import { hud } from './hud';

/**
 * All user-facing actions. Screens call these; these call pure meta logic,
 * persist the save, and drive the 3D controller and services.
 */

const now = () => Date.now();
let toastId = 0;
let lastPurchaseOrRewardAt = 0;

/* ---------------- save helpers ---------------- */

function commit(next: SaveData) {
  app.set({ save: next });
  void persistSave(next);
}

function mutate(fn: (s: SaveData) => SaveData | null): boolean {
  const next = fn(app.get().save);
  if (!next) return false;
  commit(next);
  return true;
}

export function toast(text: string, tone: 'info' | 'good' | 'bad' = 'info') {
  app.set({ toast: { id: ++toastId, text, tone } });
}

/* ---------------- quality ---------------- */

export function resolveQuality(s: SaveData, override: 'low' | 'medium' | null = app.get().qualityOverride): QualityTier {
  if (s.settings.quality !== 'auto') return s.settings.quality;
  const base: QualityTier = Platform.OS === 'web' ? 'medium' : PixelRatio.get() >= 3 ? 'high' : 'medium';
  if (override === 'low' || (override === 'medium' && base === 'high')) return override;
  return base;
}

export function dprFor(q: QualityTier): number {
  const pr = PixelRatio.get();
  return q === 'low' ? 1 : q === 'medium' ? Math.min(pr, 1.5) : Math.min(pr, 2);
}

function applySettings(s: SaveData) {
  audio.setMusic(s.settings.music);
  audio.setSfx(s.settings.sfx);
  haptics.setEnabled(s.settings.haptics);
  analytics.setEnabled(s.settings.analytics);
  setLanguage(s.settings.language);
  game.setQuality(resolveQuality(s));
  app.set({ lang: s.settings.language });
}

/* ---------------- boot ---------------- */

let booted = false;

export async function boot() {
  if (booted) return;
  booted = true;
  const { save: loaded, source } = await loadSave();
  let save = refreshMissions(loaded, now());
  if (save.runInProgress !== null) save = { ...save, runInProgress: null }; // app was closed mid-run: the level simply restarts
  commit(save);
  applySettings(save);
  if (source === 'backup' || source === 'recovered-default') log.warn('save recovered from', source);

  game.setCallbacks({ onEnd: onRunEnd });
  game.onSlowFrames = () => {
    const st = app.get();
    if (st.save.settings.quality !== 'auto') return;
    const cur = resolveQuality(st.save);
    if (cur === 'low') return;
    const next = cur === 'high' ? 'medium' : 'low';
    log.info('auto quality downgrade to', next);
    app.set({ qualityOverride: next });
    game.setQuality(next);
  };
  game.setSkin(skinById(save.skins.selected));
  loadMenuLevel();
  game.setCameraMode('menu');

  // Services in parallel; the game never waits on the network.
  await audio.init();
  audio.playMusic('menu');
  iap.setVerifiedHandler(async (productId, transactionId) => {
    const res = grantPurchase(app.get().save, productId, transactionId);
    commit(res.save);
    await persistSave(res.save);
    if (res.granted) {
      lastPurchaseOrRewardAt = now();
      audio.play('purchase');
      haptics.success();
      if (res.save.purchases.starter) game.setSkin(skinById(res.save.skins.selected));
    }
  });
  void iap.init().then(() => app.set((s) => ({ storeTick: s.storeTick + 1 })));
  ads.subscribe(() => app.set((s) => ({ storeTick: s.storeTick + 1 })));
  void ads.init();

  analytics.track({ name: 'app_open', params: { session: save.stats.runs } });
  app.set({ screen: 'home' });
  // Daily reward popup on launch when available (after the first level).
  if (save.level > 1 && save.daily.lastClaimDay !== dayKey(now())) openModal('daily');

  RNAppState.addEventListener('change', onAppState);
  if (Platform.OS === 'android') BackHandler.addEventListener('hardwareBackPress', onBack);
}

function onAppState(state: string) {
  app.set({ foreground: state === 'active' });
  if (state === 'active') {
    audio.setSuspended(false);
    const s = refreshMissions(app.get().save, now());
    if (s !== app.get().save) commit(s);
  } else {
    audio.setSuspended(true);
    void persistSave(app.get().save);
    const st = app.get();
    // Never let the crowd run while the app is in background.
    if (st.screen === 'play' && game.sim && (game.sim.s.phase === 'running' || game.sim.s.phase === 'battle') && !st.modal) pause();
  }
}

function onBack(): boolean {
  const st = app.get();
  if (st.modal && st.modal !== 'revive' && st.modal !== 'results') {
    if (st.modal === 'pause') resume();
    else closeModal();
    return true;
  }
  if (st.screen === 'play' && !st.modal) {
    pause();
    return true;
  }
  return false;
}

/* ---------------- modals ---------------- */

export function openModal(m: ModalId) {
  const st = app.get();
  if (st.modal && st.modal !== m) {
    app.set({ queue: [...st.queue, m] });
    return;
  }
  app.set({ modal: m });
  if (m === 'skins') game.setCameraMode('showcase');
  if (m === 'missions' || m === 'challenges') commit(refreshMissions(app.get().save, now()));
}

export function closeModal() {
  const st = app.get();
  if (st.modal === 'skins') game.setCameraMode(st.screen === 'play' ? 'play' : 'menu');
  const [next, ...rest] = st.queue;
  app.set({ modal: next ?? null, queue: rest, rewardPopup: next === 'reward' ? st.rewardPopup : null });
}

function showReward(title: string, reward: Reward) {
  app.set({ rewardPopup: { title, reward } });
  openModal('reward');
  audio.play('chest_open');
  haptics.success();
}

/* ---------------- runs ---------------- */

function loadMenuLevel() {
  const s = app.get().save;
  const def = generateLevel(s.level);
  game.loadLevel(def, startBonus(s.upgrades.startCrowd));
  app.set({ run: { def, mode: 'campaign', startedAt: now() } });
}

/** PLAY on the home screen: switch to gameplay framing, "drag to run". */
export function play() {
  const st = app.get();
  if (!st.run || st.run.mode !== 'campaign' || game.sim?.s.phase !== 'ready') loadMenuLevel();
  enterPlay();
}

function enterPlay() {
  const st = app.get();
  game.setCameraMode('play');
  audio.play('tap');
  audio.playMusic('game', st.run?.def.isBoss ? 1.06 : 1);
  app.set({ screen: 'play', modal: null, results: null });
  const def = app.get().run!.def;
  analytics.track({ name: 'level_start', params: { level: def.level, world: def.world, mode: app.get().run!.mode } });
  commit({ ...app.get().save, runInProgress: def.level });
}

export function startDailyChallenge() {
  const s = app.get().save;
  const def = dailyChallengeLevel(s, now());
  game.loadLevel(def, startBonus(s.upgrades.startCrowd));
  app.set({ run: { def, mode: 'daily', startedAt: now() } });
  closeAllModals();
  enterPlay();
}

function closeAllModals() {
  if (app.get().modal === 'skins') game.setCameraMode('menu');
  app.set({ modal: null, queue: [] });
}

export function pause() {
  if (app.get().modal) return;
  game.setPaused(true);
  app.set({ modal: 'pause' });
}

export function resume() {
  game.setPaused(false);
  app.set({ modal: null });
}

export function restartLevel() {
  const st = app.get();
  game.setPaused(false);
  if (st.run?.mode === 'daily') return startDailyChallenge();
  loadMenuLevel();
  enterPlay();
}

export function goHome() {
  game.setPaused(false);
  loadMenuLevel();
  game.setCameraMode('menu');
  audio.playMusic('menu');
  app.set({ screen: 'home', modal: null, queue: [], results: null });
}

function onRunEnd(kind: 'won' | 'lost', sim: Simulation, info: { multiplier: number; stallIndex: number; finishCount: number; perfect: boolean }) {
  if (kind === 'lost' && sim.canRevive()) {
    const n = reviveCount(sim.s.stats.peak);
    const canAd = ads.rewardedReady();
    const canGems = app.get().save.gems >= REVIVE_GEMS;
    if (canAd || canGems) {
      app.set({ modal: 'revive', reviveCount: n });
      return;
    }
  }
  finalizeRun(kind === 'won', sim, info);
}

export async function reviveWithAd() {
  const ok = await ads.showRewarded('revive');
  if (!ok) return toast(t('purchaseFailed').split('.')[0], 'bad');
  lastPurchaseOrRewardAt = now();
  commit(recordRewardedShown(app.get().save, now()));
  doRevive();
}

export function reviveWithGems() {
  if (!mutate((s) => spendGems(s, REVIVE_GEMS))) return toast(t('notEnough', { c: '💎' }), 'bad');
  doRevive();
}

function doRevive() {
  const n = app.get().reviveCount;
  game.revive(n);
  app.set({ modal: null });
}

export function declineRevive() {
  const sim = game.sim;
  if (!sim) return;
  app.set({ modal: null });
  finalizeRun(false, sim, { multiplier: 1, stallIndex: -1, finishCount: 0, perfect: false });
}

function finalizeRun(won: boolean, sim: Simulation, info: { multiplier: number; stallIndex: number; finishCount: number; perfect: boolean }) {
  const st = app.get();
  const run = st.run;
  if (!run) return;
  const result: RunResult = {
    mode: run.mode,
    level: run.def.level,
    won,
    finishCount: info.finishCount,
    multiplier: info.multiplier,
    stallIndex: info.stallIndex,
    perfect: info.perfect,
    progress: sim.progress,
    stats: { ...sim.s.stats },
    revived: sim.s.revived,
    challenge: run.def.challenge,
  };
  const prevWorld = worldOfLevel(st.save.level);
  const { save, rewards } = applyRunResult(st.save, result, now());
  commit(recordRunForAds(save));
  audio.duck(true);
  analytics.track({ name: 'level_end', params: { level: result.level, won, finish: result.finishCount, peak: result.stats.peak, time: Math.round(sim.s.t), revived: result.revived, mode: run.mode } });
  app.set({ results: { result, rewards, tripled: false }, modal: 'results' });
  if (rewards.newWorld && worldOfLevel(save.level) > prevWorld) {
    analytics.track({ name: 'world_unlocked', params: { world: rewards.newWorld } });
    app.set((s) => ({ queue: [...s.queue, 'worldUnlock'] }));
  }
}

export async function tripleCoins() {
  const r = app.get().results;
  if (!r || r.tripled) return;
  const ok = await ads.showRewarded('tripleCoins');
  if (!ok) return;
  lastPurchaseOrRewardAt = now();
  commit(recordRewardedShown(applyAdBonus(app.get().save, r.rewards.adBonusCoins), now()));
  app.set({ results: { ...r, tripled: true } });
  audio.play('coin');
  haptics.success();
}

/** Results → next run (campaign) — the only place interstitials may appear. */
export async function continueAfterResults(kind: 'next' | 'retry' | 'home') {
  audio.duck(false);
  const st = app.get();
  const queued = st.queue;
  app.set({ modal: null, queue: [] });
  const suppress = now() - lastPurchaseOrRewardAt < 90_000;
  if (shouldShowInterstitial(st.save, now(), { suppress }) && ads.providerName !== 'none') {
    const shown = await ads.showInterstitial('between_levels');
    if (shown) commit(recordInterstitialShown(app.get().save, now()));
  }
  if (kind === 'home') goHome();
  else if (kind === 'retry') restartLevel();
  else if (st.run?.mode === 'daily') goHome();
  else {
    loadMenuLevel();
    enterPlay();
  }
  // Pending modals (world unlock) are shown after the transition.
  if (queued.length) app.set({ modal: queued[0], queue: queued.slice(1) });
}

/* ---------------- meta actions ---------------- */

export function claimDaily() {
  const r = claimDailyPure(app.get().save, now());
  if (!r) return;
  commit(r.save);
  analytics.track({ name: 'reward', params: { source: 'daily', coins: r.reward.coins, gems: r.reward.gems } });
  app.set({ modal: null });
  showReward(t('day', { n: r.dayIndex + 1 }), r.reward);
}

export function claimMission(id: string) {
  const r = claimMissionPure(app.get().save, id);
  if (!r) return;
  commit(r.save);
  analytics.track({ name: 'mission_claimed', params: { id } });
  audio.play('coin');
  haptics.success();
  toast(rewardText(r.reward), 'good');
}

export function claimAchievement(id: string) {
  const r = claimAchPure(app.get().save, id);
  if (!r) return;
  commit(r.save);
  analytics.track({ name: 'mission_claimed', params: { id: 'ach-' + id } });
  audio.play('unlock');
  haptics.success();
  toast(rewardText(r.reward), 'good');
}

export function openChest(source: 'basic' | 'epic' | 'keys'): Reward | null {
  const r = openChestPure(app.get().save, source);
  if (!r) return null;
  commit(r.save);
  analytics.track({ name: 'chest_opened', params: { tier: source } });
  if (r.reward.skin) analytics.track({ name: 'skin_unlocked', params: { skin: r.reward.skin, source: 'chest' } });
  return r.reward;
}

export function buyUpgrade(id: UpgradeId) {
  if (!mutate((s) => buyUpgradePure(s, id))) {
    haptics.error();
    return toast(t('notEnough', { c: '🪙' }), 'bad');
  }
  audio.play('purchase');
  haptics.medium();
  // Refresh the waiting crowd so the bigger start is visible right away.
  if (game.sim?.s.phase === 'ready') loadMenuLevel();
}

export function buySkin(id: string) {
  if (!mutate((s) => buySkinPure(s, id))) {
    haptics.error();
    return toast(t('notEnough', { c: '' }).trim(), 'bad');
  }
  analytics.track({ name: 'skin_unlocked', params: { skin: id, source: 'shop' } });
  audio.play('unlock');
  haptics.success();
  selectSkin(id);
}

export function selectSkin(id: string) {
  mutate((s) => selectSkinPure(s, id));
  game.setSkin(skinById(app.get().save.skins.selected));
  audio.play('tap');
}

/** Previews a skin on the 3D crowd without selecting it. */
export function previewSkin(id: string) {
  game.setSkin(skinById(id));
}

export function updateSettings(patch: Partial<SaveData['settings']>) {
  mutate((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  applySettings(app.get().save);
}

export async function buyProduct(key: ProductKey) {
  if (!iap.available) return toast(t('storeUnavailable'), 'bad');
  app.set({ busy: true });
  try {
    const status = await iap.buy(key);
    if (status === 'success') toast(t('purchaseSuccess'), 'good');
    else if (status === 'pending') toast(t('purchasePending'), 'info');
    else if (status === 'error') toast(t('purchaseFailed'), 'bad');
    else if (status === 'unavailable') toast(t('storeUnavailable'), 'bad');
  } finally {
    app.set({ busy: false });
  }
}

export async function restorePurchases() {
  if (!iap.available) return toast(t('storeUnavailable'), 'bad');
  app.set({ busy: true });
  const ids = await iap.restore();
  app.set({ busy: false });
  if (ids === null) return toast(t('purchaseFailed'), 'bad');
  const before = app.get().save;
  const next = restoreEntitlements(before, ids);
  commit(next);
  toast(next !== before ? t('restored') : t('restoreNone'), next !== before ? 'good' : 'info');
}

export async function freeCoins() {
  const s = app.get().save;
  const today = dayKey(now());
  const used = s.ads.freeCoinsDay === today ? s.ads.freeCoinsCount : 0;
  if (used >= FREE_COINS_PER_DAY) return;
  const ok = await ads.showRewarded('freeCoins');
  if (!ok) return;
  lastPurchaseOrRewardAt = now();
  const amount = freeCoinsAmount(s.level);
  mutate((x) => recordRewardedShown(grantReward({ ...x, ads: { ...x.ads, freeCoinsDay: today, freeCoinsCount: used + 1 } }, { coins: amount }), now()));
  audio.play('coin');
  toast(`+${amount} 🪙`, 'good');
}

export function buyCoinsWithGems(packId: string) {
  const pack = GEM_COIN_PACKS.find((p) => p.id === packId);
  if (!pack) return;
  const coins = gemPackCoins(pack.coinsFactor, app.get().save.level);
  if (!mutate((s) => (s.gems >= pack.gems ? grantReward({ ...s, gems: s.gems - pack.gems }, { coins }) : null))) {
    haptics.error();
    return toast(t('notEnough', { c: '💎' }), 'bad');
  }
  audio.play('purchase');
  toast(`+${coins} 🪙`, 'good');
}

export async function resetProgress() {
  await wipeSave();
  const fresh = { ...defaultSave(now()), settings: app.get().save.settings };
  commit(fresh);
  game.setSkin(skinById(fresh.skins.selected));
  goHome();
}

export function markWorldSeen() {
  const lvl = app.get().save.level;
  mutate((s) => ({ ...s, seenWorlds: Math.max(s.seenWorlds, worldOfLevel(lvl)) }));
}

export function markMechanicsSeen(ids: string[]) {
  mutate((s) => {
    const set = new Set(s.seenMechanics);
    let changed = false;
    for (const id of ids) if (!set.has(id as never)) { set.add(id as never); changed = true; }
    return changed ? { ...s, seenMechanics: [...set] } : null;
  });
}

export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`+${r.coins} 🪙`);
  if (r.gems) parts.push(`+${r.gems} 💎`);
  if (r.keys) parts.push(`+${r.keys} 🔑`);
  if (r.chest) parts.push(r.chest === 'epic' ? t('chestEpic') : t('chestBasic'));
  if (r.skin) parts.push(skinById(r.skin).name.en);
  return parts.join('  ');
}

export const currentWorldInfo = () => getWorld(worldOfLevel(app.get().save.level));
export { hud };
