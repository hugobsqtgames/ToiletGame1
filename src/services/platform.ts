import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform, TurboModuleRegistry } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/** Runtime capabilities, resolved once. */
export const isWeb = Platform.OS === 'web';
export const isIOS = Platform.OS === 'ios';
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const appVersion: string = Constants.expoConfig?.version ?? '1.0.0';

/** True when the Google Mobile Ads native module is linked (dev/production builds). */
export function hasAdMobNative(): boolean {
  if (isWeb || isExpoGo) return false;
  try {
    return TurboModuleRegistry.get('RNGoogleMobileAdsModule') != null;
  } catch {
    return false;
  }
}

/** True when the StoreKit bridge (expo-iap) is linked. */
export function hasIapNative(): boolean {
  if (isWeb || isExpoGo) return false;
  try {
    return requireOptionalNativeModule('ExpoIap') != null;
  } catch {
    return false;
  }
}
