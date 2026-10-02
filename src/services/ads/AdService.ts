import { hasAdMobNative, isIOS } from '../platform';
import { log } from '../log';
import { analytics } from '../analytics';
import type { RewardedPlacement } from './policy';
import { createAdMobProvider } from './admob';
import { createDevSimProvider } from './devSim';

/**
 * Ad facade used by the game. Gameplay code never touches an SDK directly.
 * Providers:
 *  - AdMob (react-native-google-mobile-ads) in development/production builds,
 *  - DevSim in __DEV__ when the native SDK is not linked (Expo Go / web):
 *    a clearly labeled "TEST AD" overlay to exercise the flows,
 *  - None otherwise (rewarded buttons are hidden, nothing is faked).
 */
export interface AdProvider {
  readonly name: 'admob' | 'devsim' | 'none';
  init(): Promise<void>;
  isRewardedReady(): boolean;
  isInterstitialReady(): boolean;
  /** Resolves true only if the user earned the reward. */
  showRewarded(): Promise<boolean>;
  showInterstitial(): Promise<boolean>;
  privacyOptionsRequired(): boolean;
  showPrivacyOptions(): Promise<void>;
}

const noneProvider: AdProvider = {
  name: 'none',
  init: async () => {},
  isRewardedReady: () => false,
  isInterstitialReady: () => false,
  showRewarded: async () => false,
  showInterstitial: async () => false,
  privacyOptionsRequired: () => false,
  showPrivacyOptions: async () => {},
};

type Listener = () => void;

class AdService {
  private provider: AdProvider = noneProvider;
  private listeners = new Set<Listener>();
  private showing = false;

  async init() {
    try {
      if (hasAdMobNative()) this.provider = createAdMobProvider(() => this.notify(), isIOS);
      else if (typeof __DEV__ !== 'undefined' && __DEV__) this.provider = createDevSimProvider(() => this.notify());
      await this.provider.init();
    } catch (e) {
      log.warn('ads init failed, ads disabled', e);
      this.provider = noneProvider;
    }
    this.notify();
  }

  get providerName() {
    return this.provider.name;
  }

  get isShowing() {
    return this.showing;
  }

  rewardedReady() {
    return this.provider.isRewardedReady();
  }

  async showRewarded(placement: RewardedPlacement): Promise<boolean> {
    if (this.showing || !this.provider.isRewardedReady()) return false;
    this.showing = true;
    analytics.track({ name: 'ad_shown', params: { format: 'rewarded', placement } });
    try {
      const ok = await this.provider.showRewarded();
      if (ok) analytics.track({ name: 'ad_reward', params: { placement } });
      return ok;
    } catch (e) {
      log.warn('rewarded failed', e);
      return false;
    } finally {
      this.showing = false;
      this.notify();
    }
  }

  async showInterstitial(placement: string): Promise<boolean> {
    if (this.showing || !this.provider.isInterstitialReady()) return false;
    this.showing = true;
    analytics.track({ name: 'ad_shown', params: { format: 'interstitial', placement } });
    try {
      return await this.provider.showInterstitial();
    } catch (e) {
      log.warn('interstitial failed', e);
      return false;
    } finally {
      this.showing = false;
      this.notify();
    }
  }

  privacyOptionsRequired() {
    return this.provider.privacyOptionsRequired();
  }

  showPrivacyOptions() {
    return this.provider.showPrivacyOptions();
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private notify() {
    for (const l of this.listeners) l();
  }
}

export const ads = new AdService();
