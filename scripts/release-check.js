#!/usr/bin/env node
/**
 * Pre-release gate: fails while anything still points to test/placeholder values.
 *   npm run release-check
 * Run it before `eas build --profile production` (see docs/RELEASE.md).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const results = [];
const check = (ok, label, fix, blocking = true) => results.push({ ok, label, fix, blocking });

const app = JSON.parse(read('app.json')).expo;
const eas = JSON.parse(read('eas.json'));
const monetization = read('src/config/monetization.ts');
const meta = read('src/ui/screens/MetaModals.tsx');
const GOOGLE_SAMPLE = '3940256099942544';

// Ads
const prodBlock = /production:\s*{([^}]*)}/.exec(monetization)?.[1] ?? '';
check(!/REPLACE_ME/.test(prodBlock), 'AdMob production ad units (interstitial + rewarded)', 'Set ADMOB.production in src/config/monetization.ts (AdMob console → Apps → Ad units).');
const plugin = (app.plugins || []).find((p) => Array.isArray(p) && p[0] === 'react-native-google-mobile-ads');
const iosAppId = plugin?.[1]?.iosAppId ?? '';
check(iosAppId && !iosAppId.includes(GOOGLE_SAMPLE), 'AdMob iOS app ID in app.json', 'Replace the Google sample app ID (ca-app-pub-3940256099942544~…) with your AdMob app ID.');
const codeAppId = /iosAppId:\s*'([^']+)'/.exec(monetization)?.[1] ?? '';
check(codeAppId === iosAppId, 'AdMob app ID identical in app.json and monetization.ts', 'Use the same app ID in both files.');
check((plugin?.[1]?.skAdNetworkItems ?? []).length >= 1, 'SKAdNetwork identifiers', 'Add Google’s recommended SKAdNetwork list to app.json (developers.google.com/admob/ios/ios14).', false);

// Privacy / legal
const privacy = /PRIVACY_POLICY_URL = '([^']+)'/.exec(meta)?.[1] ?? '';
check(/^https:\/\//.test(privacy) && !/example\.com/.test(privacy), 'Privacy policy URL', 'Host docs/PRIVACY_POLICY.md and set PRIVACY_POLICY_URL in src/ui/screens/MetaModals.tsx (same URL in App Store Connect).');
check(!!app.ios?.privacyManifests?.NSPrivacyAccessedAPITypes?.length, 'iOS privacy manifest', 'Add expo.ios.privacyManifests to app.json.');
check(app.ios?.infoPlist?.ITSAppUsesNonExemptEncryption === false, 'Export compliance (ITSAppUsesNonExemptEncryption = false)', 'Set it in app.json → ios.infoPlist.');
const att = (app.plugins || []).find((p) => Array.isArray(p) && p[0] === 'expo-tracking-transparency');
check(!!att?.[1]?.userTrackingPermission, 'App Tracking Transparency message', 'Set userTrackingPermission for expo-tracking-transparency.');

// Build / identity
check(!!app.extra?.eas?.projectId && !/REPLACE/.test(app.extra.eas.projectId), 'EAS project linked (extra.eas.projectId)', 'Run `npx eas-cli@latest init` once (it writes the project ID).');
check(/^[a-z0-9.]+$/i.test(app.ios?.bundleIdentifier ?? ''), `Bundle identifier (${app.ios?.bundleIdentifier})`, 'Set ios.bundleIdentifier (must match App Store Connect and the IAP product IDs).');
check(/^\d+\.\d+\.\d+$/.test(app.version ?? ''), `Version ${app.version}`, 'Set expo.version (x.y.z).');
const prodEnv = eas.build?.production?.env ?? {};
check(prodEnv.EXPO_PUBLIC_DEBUG_HOOKS !== '1', 'Debug hooks disabled in production builds', 'Never set EXPO_PUBLIC_DEBUG_HOOKS=1 for production.');
check(!/REPLACE/.test(JSON.stringify(eas)), 'No placeholders in eas.json', 'Fill or remove the REPLACE_… values in eas.json.');

// Icon: 1024×1024, no alpha (App Store rejects transparent icons)
const png = fs.readFileSync(path.join(ROOT, app.icon));
const w = png.readUInt32BE(16), h = png.readUInt32BE(20), colorType = png[25];
check(w === 1024 && h === 1024 && (colorType === 2 || colorType === 0), `App icon ${w}×${h}, ${colorType === 6 || colorType === 4 ? 'HAS ALPHA' : 'opaque'}`, 'The App Store icon must be 1024×1024 without transparency.');

// IAP
const products = [...read('src/services/iap/catalog.ts').matchAll(/id: `\$\{BUNDLE_ID\}([^`]+)`/g)].map((m) => (app.ios?.bundleIdentifier ?? '') + m[1]);
check(products.length > 0, `IAP product IDs to create in App Store Connect: ${products.join(', ')}`, 'Create these exact product IDs (In-App Purchases) before submitting.', false);

let failed = 0;
for (const r of results) {
  const mark = r.ok ? '✅' : r.blocking ? '❌' : '⚠️ ';
  console.log(`${mark} ${r.label}`);
  if (!r.ok) console.log(`   → ${r.fix}`);
  if (!r.ok && r.blocking) failed++;
}
console.log(failed ? `\n${failed} blocking item(s) before release.` : '\nReady for a production build.');
process.exit(failed ? 1 : 0);
