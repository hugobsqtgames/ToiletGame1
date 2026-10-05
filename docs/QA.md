# QA, audit & known limitations

## Automated tests (`npm test`, 1,422 tests — the stress/fuzz/monkey battery is described in [TESTING.md](TESTING.md))
* **Gates**: every operation, clamping at 9,999,999, timed gates, labels.
* **Level generation**: deterministic per seed; not a modulo loop (levels n and n+10/20/40/80/800 differ);
  levels 1–3000 + 10 000, 123 456, 9 999 999 are all valid (finite numbers, bounds, rivals > 0, finish corridor
  empty); difficulty increases; world mapping is infinite.
* **Simulation**: gates apply, tutorial and levels 1–25 are beaten by the planner bot, random play loses far
  more (decisions matter), levels 50 000+ beatable with one revive, crowd of 1 → death → single revive,
  9-million crowd with successive multipliers, clone independence.
* **Meta**: save round-trip, truncated/tampered/garbage saves rejected, invalid fields sanitized, v1 → v2
  migration, daily reward streak/miss/loop/clock rollback, level progression, chests, world unlock + skin,
  missions claim-once, infinite achievements, upgrades/skins costs, daily challenge rewards once per day,
  mission clock-rollback farming blocked, missions suited to the player's level.
* **Ads policy**: no ads for new players, frequency, cooldown, Remove Ads.
* **IAP**: idempotent grants per transaction, non-consumables never double-granted, restore never re-grants
  consumables, unknown products ignored.

## Manual / scripted end-to-end runs (web build in headless Chromium, real UI)
Home → PLAY → drag → gates/walls/coins → finish stalls → results → NEXT → level 2; defeat → revive (gems) →
second defeat → CLOGGED! → retry; daily reward claim; chests (golden open); missions tabs; world map;
challenges; skins preview/select/buy; settings toggles; shop; sandbox purchase → Remove Ads; rewarded ×3 coins
through the test-ad overlay; level 25 (Airport) with upgrades; injected high-level saves.
Balancing: `npm run balance` (planner win rates: 100% levels 2–80, ~95% 100–140, ~78% 200–240, ~72% 1000+,
90–100% with a revive; random bot ≈ 0–40%).

## Stress battery & UI monkey (latest run)
* Jest: **1,403 / 1,403 passing** (7 suites). Lint and typecheck clean.
* UI monkey on the production web build: ~6,000 random actions over 9 sessions (fresh installs, level-25/57 and
  world-8 saves; random taps, triple taps, drags, background/foreground, 70+ page reloads mid-run; a "realistic
  player" mode that plays runs to victory/defeat/revive/battles). **0 page errors, 0 NaN/undefined on screen,
  0 corrupted saves, 0 stuck runs**; JS heap stays 20–60 MB (no leak across reloads and levels).
  Only finding: expo-audio's *web* player calls `HTMLMediaElement.play()` without handling its rejection
  (autoplay policy / play-pause race) → harmless unhandled rejections on web only (not on iOS).
* iOS production bundle inspected: no `three.cjs`, no Node-only API, no debug hooks.

## Final pre-release pass (soundtrack build)
* Jest **1,422 / 1,422**, lint + typecheck clean, `expo-doctor` 21/21, iOS export + prebuild verified (6 AAC loops +
  17 SFX bundled, privacy manifest, en/fr strings, no microphone key, no debug code).
* UI monkey: 1,800 random actions on the final web build → 0 problems; real playback check: menu theme on home,
  crossfade to the world's track (e.g. Surf in Splash Park) on PLAY, no media errors; chest stress → exact counts.
* Fixed: the soundtrack generator was not deterministic (random noise unseeded) → seeded, bit-identical renders.
* Fixed: AAC music could not play in browsers without AAC (open-source Chromium) → web builds use MP3 copies
  (`musicSources.web.ts`); iOS keeps the gapless AAC loops.

## Pre-release audit (October 2026)
* Jest **1,417 / 1,417**, lint + typecheck clean, `expo-doctor` 21/21, iOS export + `expo prebuild` verified
  (privacy manifest, localized ATT prompt, no debug hooks / Node APIs in the bundle).
* UI monkey on the final build: 1,800 random actions (fresh, advanced and daily-reward saves) → 0 problems;
  deterministic chest stress (triple tap on OPEN, tap spam during the animation, OPEN NEXT spam) → exact counts.
* `npm run release-check` lists what only the publisher can provide (AdMob IDs, privacy policy URL, `eas init`).

| Finding | Fix |
|---|---|
| Double tap on "No thanks" (revive) counted the run twice (coins, stats, missions) | Run results applied once per run |
| Double tap on "Revive (gems)" spent the gems twice | Guard before spending |
| NEXT tapped twice / during the interstitial restarted the next level | Single transition guard |
| Reset progress also wiped Remove Ads / Starter pack | Purchases and paid skin kept |
| Restore purchases could leave the UI busy forever on an error | `try/finally` |
| The 120 s purchase timeout was never cleared and could fail a later purchase | Timer per purchase, cleared on settle |
| Double tap on a chest's OPEN opened two chests (one reveal skipped) | Debounced |
| ATT prompt in English only | Localized (en/fr) via `locales` |
| No iOS privacy manifest; EAS placeholders that would break `eas build` | `ios.privacyManifests`, placeholders removed |

## Audit findings fixed (stress battery)
| Finding | Fix |
|---|---|
| Boss levels without a boss (20, 100, 110, 310…): boss placed past the corridor limit and filtered out | Fixed boss spot, runway cleared |
| "NEW!" cards announced absent mechanics / missed present ones | Derived from the final level content |
| Revived crowd invisible & untouchable ~0.45 s; peak not updated; NaN count; finish count 0 when dying on the line | Formation reset, clamps, finish restart |
| Start bonus could exceed the 9,999,999 cap; NaN steering corrupted x; finished sim accepted input | Clamps & guards |
| Weekly missions did not refresh for a week across DST in years starting on Monday (e.g. Paris, March 2029) | DST-proof `weekKey` |
| A clock once far in the future locked daily rewards / missions / interstitials until that date; corrupted weekly key froze missions | 7-day rollback window, key validation |
| `formatCount(NaN)` → "NaNB"; NaN coins possible; `generateLevel(NaN)` crashed | Input guards |
| Late-game gate labels ("+19000") overflowed onto neighbouring gates | Labels fit their panel; compact values ≥ 10K |

## Audit findings fixed (initial audit)
| Finding | Fix |
|---|---|
| Formation refilled instantly after a hit → a wall ate the whole crowd | Persistent holes that close after 0.45 s |
| Rivals sized from an optimistic estimate → unwinnable late levels | Geometric mean of optimistic/pessimistic estimates |
| Save timestamps clamped by the sanitizer | Dedicated time range |
| Patterns could spill obstacles into the finish corridor | Corridor filter + test |
| Crowd character ≈ 3 500 vertices (×220) | Indexed merging + lower tessellation → 644 vertices |
| Every 3D text glyph was a draw call, never culled | Static texts baked to one mesh; culling enabled |
| Instanced GPU buffers not released on level change | `InstancedMesh.dispose()` in level disposal |
| Missions farmable by changing the device date | Rollback-safe refresh + test |
| App stuck on boot if fonts fail to load | System-font fallback |
| Revive countdown ran while backgrounded | Countdown frozen in background |
| `useAnimatedValue` missing on react-native-web | Own cross-platform hook |
| Missions impossible for new players ("beat rivals" at level 1) | `minLevel` per template |
| Finish camera inside the stall walls; full-width signs hid the view | High corridor camera; signs on stall roofs |
| Floating "x3" texts slid off-screen | Texts travel with the crowd |
| Coins inflated by x10 stalls | Stall multiplier damped (^0.7) |
| Wrong toasts (ad failure shown as purchase failure, missing currency) | Dedicated messages |
| Malformed voxel glyphs (S, J, K, M, R, W, Y, ÷, 0, ".") | Redrawn and verified |

## Known limitations (honest list)
* **No physical iPhone or Xcode was available** in this environment. iOS was validated through: TypeScript,
  lint, `expo-doctor` (21/21), `expo prebuild --platform ios` (config plugins, Info.plist), and the full app
  running on web with the same three.js code. The first `eas build --profile development` on a device is the
  next verification step (expected issues, if any: GL context specifics of expo-gl, audio session behavior).
* Real AdMob ads and real StoreKit purchases require your accounts/IDs (placeholders documented).
* Performance numbers on device are not measured here; the adaptive quality system will step down
  automatically on slow devices.
* Leaderboards (Game Center) are not implemented; stats needed for them are stored.
