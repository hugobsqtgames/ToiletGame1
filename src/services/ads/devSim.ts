import type { AdProvider } from './AdService';

/**
 * DEVELOPMENT ONLY. Simulates ad flows in Expo Go / web so every rewarded
 * placement can be tested end-to-end. The UI renders a full-screen overlay
 * labeled "TEST AD — simulated" (ui/components/DevAdOverlay.tsx).
 * Never instantiated in release builds.
 */
export interface DevAdRequest {
  kind: 'rewarded' | 'interstitial';
  resolve: (watchedToEnd: boolean) => void;
}

type Presenter = (req: DevAdRequest) => void;
let presenter: Presenter | null = null;

export function registerDevAdPresenter(p: Presenter | null) {
  presenter = p;
}

export function createDevSimProvider(_onChange: () => void): AdProvider {
  const show = (kind: DevAdRequest['kind']) =>
    new Promise<boolean>((resolve) => {
      if (!presenter) return resolve(false);
      presenter({ kind, resolve });
    });
  return {
    name: 'devsim',
    init: async () => {},
    isRewardedReady: () => presenter !== null,
    isInterstitialReady: () => presenter !== null,
    showRewarded: () => show('rewarded'),
    showInterstitial: () => show('interstitial'),
    privacyOptionsRequired: () => false,
    showPrivacyOptions: async () => {},
  };
}
