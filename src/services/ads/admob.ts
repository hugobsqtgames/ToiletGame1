import { ADMOB, isPlaceholder } from '../../config/monetization';
import { log } from '../log';
import type { AdProvider } from './AdService';

/**
 * Google AdMob provider. Loaded lazily with require() so that Expo Go/web
 * (where the native module does not exist) never evaluate the SDK.
 * Flow: UMP consent (GDPR/US states) → ATT prompt on iOS → SDK init → preload.
 */
export function createAdMobProvider(onChange: () => void, ios: boolean): AdProvider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sdk = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
  const { default: mobileAds, AdsConsent, InterstitialAd, RewardedAd, AdEventType, RewardedAdEventType } = sdk;
  const dev = typeof __DEV__ !== 'undefined' && __DEV__;
  const unitInterstitial = dev ? ADMOB.test.interstitial : ADMOB.production.interstitial;
  const unitRewarded = dev ? ADMOB.test.rewarded : ADMOB.production.rewarded;
  const interstitialEnabled = !isPlaceholder(unitInterstitial);
  const rewardedEnabled = !isPlaceholder(unitRewarded);
  if (!interstitialEnabled || !rewardedEnabled) log.warn('AdMob production ad unit IDs are placeholders: those formats are disabled');

  let interstitial: ReturnType<typeof InterstitialAd.createForAdRequest> | null = null;
  let rewarded: ReturnType<typeof RewardedAd.createForAdRequest> | null = null;
  let interstitialLoaded = false;
  let rewardedLoaded = false;
  let privacyRequired = false;
  let canRequest = false;
  let retry = 0;

  const backoff = () => Math.min(60_000, 2000 * Math.pow(2, retry++));

  function loadInterstitial() {
    if (!interstitialEnabled || !canRequest) return;
    interstitial = InterstitialAd.createForAdRequest(unitInterstitial);
    interstitial.addAdEventListener(AdEventType.LOADED, () => {
      interstitialLoaded = true;
      retry = 0;
      onChange();
    });
    interstitial.addAdEventListener(AdEventType.ERROR, () => {
      interstitialLoaded = false;
      setTimeout(loadInterstitial, backoff());
    });
    interstitial.load();
  }

  function loadRewarded() {
    if (!rewardedEnabled || !canRequest) return;
    rewarded = RewardedAd.createForAdRequest(unitRewarded);
    rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      rewardedLoaded = true;
      retry = 0;
      onChange();
    });
    rewarded.addAdEventListener(AdEventType.ERROR, () => {
      rewardedLoaded = false;
      onChange();
      setTimeout(loadRewarded, backoff());
    });
    rewarded.load();
  }

  return {
    name: 'admob',
    async init() {
      try {
        const info = await AdsConsent.gatherConsent();
        canRequest = !!info.canRequestAds;
        privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
      } catch (e) {
        log.warn('UMP consent failed', e);
        canRequest = false;
      }
      if (ios && canRequest) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const att = require('expo-tracking-transparency') as typeof import('expo-tracking-transparency');
          if (att.isAvailable()) {
            const st = await att.getTrackingPermissionsAsync();
            if (st.canAskAgain && !st.granted) await att.requestTrackingPermissionsAsync();
          }
        } catch (e) {
          log.warn('ATT', e);
        }
      }
      if (!canRequest) return;
      await mobileAds().initialize();
      loadInterstitial();
      loadRewarded();
    },
    isRewardedReady: () => rewardedLoaded,
    isInterstitialReady: () => interstitialLoaded,
    showRewarded() {
      return new Promise<boolean>((resolve) => {
        if (!rewarded || !rewardedLoaded) return resolve(false);
        let earned = false;
        const ad = rewarded;
        const offEarn = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          earned = true;
        });
        const offClose = ad.addAdEventListener(AdEventType.CLOSED, () => {
          offEarn();
          offClose();
          rewardedLoaded = false;
          loadRewarded();
          resolve(earned);
        });
        ad.show().catch(() => {
          offEarn();
          offClose();
          rewardedLoaded = false;
          loadRewarded();
          resolve(false);
        });
      });
    },
    showInterstitial() {
      return new Promise<boolean>((resolve) => {
        if (!interstitial || !interstitialLoaded) return resolve(false);
        const ad = interstitial;
        const off = ad.addAdEventListener(AdEventType.CLOSED, () => {
          off();
          interstitialLoaded = false;
          loadInterstitial();
          resolve(true);
        });
        ad.show().catch(() => {
          off();
          interstitialLoaded = false;
          loadInterstitial();
          resolve(false);
        });
      });
    },
    privacyOptionsRequired: () => privacyRequired,
    async showPrivacyOptions() {
      try {
        await AdsConsent.showPrivacyOptionsForm();
      } catch (e) {
        log.warn('privacy form', e);
      }
    },
  };
}
