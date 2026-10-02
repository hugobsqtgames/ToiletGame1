# QA, audit & known limitations

## Automated tests (`npm test`, 37 tests)
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

## Audit findings fixed
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
