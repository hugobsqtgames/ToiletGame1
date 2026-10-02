import type { AdProvider } from './AdService';

/** Web build: AdMob is native-only; AdService falls back to DevSim/None. */
export function createAdMobProvider(_onChange: () => void, _ios: boolean): AdProvider {
  throw new Error('AdMob is not available on web');
}
