/**
 * Monetization identifiers. Replace every `REPLACE_ME` before release
 * (see docs/MONETIZATION.md). While a production ID is still a placeholder,
 * the corresponding ad format is disabled in release builds (never fake ads).
 * Development builds always use Google's official test ad units.
 */
export const ADMOB = {
  /** Google sample app id (safe for development). Replace in app.json too. */
  iosAppId: 'ca-app-pub-3940256099942544~1458002511',
  production: {
    interstitial: 'REPLACE_ME',
    rewarded: 'REPLACE_ME',
  },
  test: {
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
};

export const isPlaceholder = (id: string) => !id || id.includes('REPLACE_ME');
