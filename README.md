# LOO RUSH 🚽 — *Everybody gotta go!*

A 3D hyper-casual crowd runner for iOS, built with **Expo SDK 57 / React Native 0.86 / three.js (react-three-fiber)**.

Swipe left and right to steer a goofy crowd toward the restroom. Pick the right gates (`+15`, `x3`, `÷2`, `?`…), dodge spinning mops and giant plungers, outnumber rival queue-jumpers, and fill as many stalls as you can at the finish. The campaign **never ends**: levels are generated procedurally and deterministically from their number, forever.

| | |
|---|---|
| Engine | Expo (managed / CNG), TypeScript strict, react-three-fiber + three r186 |
| Platforms | iOS (primary). Web build is used for previews, QA and screenshots. |
| Tests | 1,417 Jest tests: unit + stress/fuzz/monkey battery (see [docs/TESTING.md](docs/TESTING.md)), plus a Playwright UI monkey |
| Lint / types | `npm run lint` and `npm run typecheck` are clean |

## Quick start

```bash
npm install
npx expo start            # scan the QR code with Expo Go (iOS) — gameplay, UI, saves, audio all work
npm test                  # 1,417 tests incl. stress/fuzz/monkey suites (~7 min)
npm run typecheck && npm run lint
npm run balance -- 1,10,50,200,1000 5   # balancing report (planner bot vs random bot)
```

**Expo Go vs development build.** Everything except real ads and real in-app purchases runs in Expo Go.
AdMob and StoreKit are native modules: build a development client to test them
(`npx eas-cli@latest build --profile development --platform ios`). In Expo Go and in `__DEV__` web builds,
clearly labeled **TEST AD** / **SANDBOX PURCHASE** simulators let you exercise every flow without money or real ads.
Release builds never simulate anything.

## Documentation

| Doc | Content |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tech choices, file structure, systems, data flow, performance design |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | Gameplay, gates, obstacles, level generation, infinite difficulty, worlds, economy, missions, endgame |
| [docs/MONETIZATION.md](docs/MONETIZATION.md) | Ads (AdMob, consent, ATT, frequency rules), IAP (StoreKit 2 via expo-iap), IDs to configure |
| [docs/APP_STORE.md](docs/APP_STORE.md) | iOS / EAS configuration, privacy, App Store publication checklist |
| [docs/HOW_TO.md](docs/HOW_TO.md) | Add a world, level pattern, gate, obstacle, skin, reward, mission |
| [docs/preview](docs/preview/README.md) | App Store preview video (EN/FR), real app footage, rebuild pipeline |
| [docs/QA.md](docs/QA.md) | What was tested, how, audit findings and fixes, known limitations |
| [docs/mockups/](docs/mockups/) | Final visual mockups made from the real app |

## Status

Playable, complete MVP: gameplay, crowd, gates, obstacles, rivals, finish stalls, victory/defeat/revive,
infinite procedural levels, 8 themed worlds + infinite remix worlds, saves, coins/gems/keys, upgrades,
19 skins, chests, daily rewards, daily/weekly missions, infinite achievements, level challenges, daily challenge,
shop, ads and IAP architecture, FR/EN localization, audio, haptics, analytics facade.

What still needs **your** accounts/IDs before release is listed in [docs/MONETIZATION.md](docs/MONETIZATION.md#what-you-must-configure) and [docs/APP_STORE.md](docs/APP_STORE.md).
