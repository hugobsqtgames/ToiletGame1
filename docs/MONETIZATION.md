# Monetization

Principle: **never sacrifice the game for ads.** No ad ever interrupts gameplay.

## Ads (`src/services/ads/`)

| Format | Where | Rules |
|---|---|---|
| Interstitial | Only on the transition *after* the results screen (Next / Retry / Home) | Not before level 5 · at most every 3 runs · ≥120 s cooldown · never within 90 s after a rewarded ad or a purchase · never with Remove Ads (`policy.ts`, unit-tested) |
| Rewarded | Revive (second chance), ×3 coins on victory, 5 free-coin videos per day in the shop | Always opt-in; buttons only shown when an ad is actually loaded |

**Remove Ads** removes all interstitials. Rewarded videos stay available because they are opt-in and only give
bonuses; this is stated in the shop ("Optional reward videos stay available").

Providers (`AdService.ts`):
* **AdMob** (`admob.ts`) in development/production builds: UMP consent (`AdsConsent.gatherConsent`, GDPR /
  US states) → App Tracking Transparency prompt on iOS (only if ads can be requested) → SDK init → preload with
  exponential back-off. A **"Ad privacy choices"** entry appears in Settings when UMP requires it.
* **DevSim** (`devSim.ts`) only in `__DEV__` without the native module (Expo Go / web): full-screen overlay
  labeled **TEST AD**.
* **None** otherwise. If a production ad unit ID is still a placeholder, that format is disabled (we never show
  fake ads).

## In-app purchases (`src/services/iap/`)

| Key | Product ID | Type | Grants |
|---|---|---|---|
| removeAds | `com.loorush.game.removeads` | Non-consumable | No interstitials |
| starter | `com.loorush.game.starterpack` | Non-consumable | No ads + 150 gems + *Golden Throne* skin |
| gemsS | `com.loorush.game.gems.small` | Consumable | 80 gems |
| gemsM | `com.loorush.game.gems.medium` | Consumable | 450 gems |
| gemsL | `com.loorush.game.gems.large` | Consumable | 1000 gems |

Flow (`IapService.ts`, StoreKit 2 through **expo-iap**):
1. `initConnection` → `fetchProducts` (localized prices from Apple; fallback prices only while loading).
2. `requestPurchase` → `purchaseUpdatedListener`.
3. **Grant first, finish after**: `grantPurchase` applies the entitlement idempotently (keyed by transaction id,
   non-consumables also keyed by flag), the save is persisted, *then* `finishTransaction`. A crash between the
   two only replays the transaction, which is ignored if already granted.
4. Errors: user-cancelled (silent), pending (Ask to Buy → message), error (message, "you were not charged"),
   unavailable (store not reachable). A 120 s safety timeout prevents an infinite spinner.
5. **Restore purchases** (Shop + Settings): `restorePurchases` + `getAvailablePurchases` → `restoreEntitlements`
   (non-consumables only; gems are never granted twice).

Validation: StoreKit 2 transactions are signed and verified on device by expo-iap. For server-side validation
(recommended once you sell more), call your backend inside the `purchaseUpdatedListener` before `onVerified`
(marked in the code) or use `verifyPurchaseWithProvider`.

The **DevSim** IAP provider (only `__DEV__` without StoreKit) shows a "SANDBOX PURCHASE — DEVELOPMENT BUILD"
sheet. Release builds without StoreKit show "Store unavailable in this build"; nothing is ever faked.

## What you must configure

| Item | Where | Value now |
|---|---|---|
| AdMob iOS **App ID** | `app.json` → `react-native-google-mobile-ads.iosAppId` and `src/config/monetization.ts` | Google sample ID (test) |
| AdMob **interstitial** unit | `src/config/monetization.ts` → `production.interstitial` | `REPLACE_ME` (format disabled in release until set) |
| AdMob **rewarded** unit | `src/config/monetization.ts` → `production.rewarded` | `REPLACE_ME` |
| SKAdNetwork IDs of mediation partners | `app.json` → `skAdNetworkItems` | Google's `cstr6suwn9` only |
| UMP consent messages (GDPR + US) | AdMob console → Privacy & messaging | to create |
| IAP products (5) | App Store Connect → In-App Purchases, exact IDs above | to create |
| Paid Apps agreement, tax, banking | App Store Connect | to sign |
| Bundle id | `app.json` (`com.loorush.game`) and `catalog.ts` `BUNDLE_ID` | change both if needed |
| Analytics backend (optional) | `analytics.addSink(...)` | console in dev, none in prod |

Testing real purchases: use a development build + a Sandbox Apple ID (Settings → App Store → Sandbox account).
