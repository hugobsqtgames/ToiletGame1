# iOS, EAS & App Store

## iOS configuration (`app.json`)
* Bundle id `com.loorush.game`, portrait only, iPhone only (`supportsTablet: false`, `requireFullScreen`).
* Permissions: **only** `NSUserTrackingUsageDescription` (needed by ads/ATT). Microphone, background audio and
  background recording are explicitly disabled in the `expo-audio` plugin. No location, camera, contacts, etc.
* `ITSAppUsesNonExemptEncryption: false` (no custom encryption → no export compliance questions).
* Icon `assets/icon.png` (1024², opaque), splash `assets/splash-icon.png` on `#2B7BFF`.
* `npx expo prebuild --platform ios` was verified to succeed (Info.plist contains GADApplicationIdentifier,
  SKAdNetworkItems, the ATT string, and no microphone key). `ios/` is generated (CNG) and git-ignored.

## EAS (`eas.json`)
| Profile | Use |
|---|---|
| `development` | Dev client on device (real AdMob test ads, StoreKit sandbox) |
| `development-simulator` | Same, for the iOS simulator |
| `preview` | Internal distribution (TestFlight-like testing) |
| `production` | App Store build, auto-incremented build number |

```bash
npx eas-cli@latest login
npx eas-cli@latest init                      # writes extra.eas.projectId in app.json
npx eas-cli@latest build --profile development --platform ios
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --profile production --platform ios   # asks for the Apple account / app the first time
npm run release-check                         # must pass before the production build
```

## Privacy / GDPR
* No account, no personal data collected by the game. Saves stay on device.
* Analytics are anonymous gameplay events (no IDs, no device fingerprint), batched, and can be turned off in
  Settings ("Share anonymous gameplay stats"). Production ships with **no** analytics sink until you add one.
* Ads: Google UMP consent form (EEA/UK/US states) before any ad request; ATT prompt on iOS after consent;
  "Ad privacy choices" in Settings when required.
* Host a privacy policy (ready-to-host EN/FR draft: `docs/PRIVACY_POLICY.md`) and set the URL in
  `src/ui/screens/MetaModals.tsx` (`PRIVACY_POLICY_URL`).
* iOS privacy manifest (`ios.privacyManifests` in app.json): required-reason APIs used by React Native/Expo
  (UserDefaults CA92.1, file timestamps C617.1, system boot time 35F9.1, disk space E174.1). Expo and Google
  SDKs ship their own manifests.
* App Store privacy "nutrition label": declare data collected by the Google Mobile Ads SDK (Identifiers,
  Usage Data, Diagnostics — linked for tracking if the user allows ATT). Declare nothing for the game itself
  unless you plug an analytics backend.

## Publication checklist
- [ ] `npm run release-check` passes (it lists exactly what is still missing)
- [ ] Apple Developer account, Paid Apps agreement, tax & banking
- [ ] App Store Connect app record with bundle id `com.loorush.game`
- [ ] 5 IAP products created with the exact IDs (docs/MONETIZATION.md), screenshots for review
- [ ] AdMob app + 2 ad units, IDs set in `app.json` and `src/config/monetization.ts`
- [ ] UMP consent messages published in AdMob
- [ ] Privacy policy URL hosted and set in code + App Store Connect
- [ ] Privacy nutrition label filled (Google Mobile Ads data types)
- [ ] Age rating questionnaire (cartoon, mild comic mischief; 4+ / 9+ depending on ad content settings)
- [ ] `eas init`, production build, TestFlight test on 2+ iPhones (incl. an older one, e.g. iPhone XR/11)
- [ ] Sandbox purchase + restore tested; Remove Ads verified to stop interstitials
- [ ] Screenshots 6.9" & 6.5" (use docs/mockups as a base), app preview video optional
- [ ] Description, keywords, support URL, marketing URL
- [ ] Review notes: "Rewarded ads are optional; Remove Ads removes interstitials; Restore Purchases is in Shop and Settings"

## Guideline notes
* 3.1.1 IAP: all digital goods via StoreKit ✔ · Restore button ✔ · prices from StoreKit ✔
* 5.1.1 / 5.1.2: no account, ATT before tracking, consent before ads ✔
* 4.2 minimum functionality: complete game, offline ✔
* 2.3: mockups/screenshots are captured from the real app ✔
