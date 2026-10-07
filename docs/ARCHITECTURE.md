# Architecture

## 1. Technology choices (and why)

| Need | Choice | Reason |
|---|---|---|
| iOS app, fast iteration, testable on iPhone | **Expo SDK 57** (CNG, EAS) | Runs in Expo Go instantly; production builds via EAS without a Mac. |
| Real-time 3D | **three.js r186 + @react-three/fiber 9** on **expo-gl** | Native GL on iOS, same code on web (QA/screenshots). Unity was not needed: the game is geometry-light and the bottleneck (the crowd) is solved with instancing. |
| Audio | **expo-audio** | Bundled in Expo Go, pooled players. |
| Saves | **AsyncStorage** + checksum envelope + backup copy | Offline, small payload (<20 KB). |
| Ads | **react-native-google-mobile-ads** (AdMob + UMP consent) | Industry standard, official Expo config plugin. |
| IAP | **expo-iap** (StoreKit 2, OpenIAP) | Listed by Expo docs; Expo-native config plugin. |
| Navigation | **Single persistent screen + overlay state machine** | Deliberate deviation from Expo Router (see below). |

**Why not Expo Router?** A game keeps one GL context alive for its whole lifetime. Route-based navigation
would mount/unmount the canvas (GL context loss, re-uploading meshes, hitches, leak risk). Menus are React
Native overlays above one persistent `<Canvas>`. The home screen even *is* the 3D level (camera framing
changes), so pressing PLAY has zero loading time. Modal flow is handled by `state/app.ts` (`screen`, `modal`,
`queue`) and Android back is handled in `state/actions.ts`.

## 2. Folder structure

```
App.tsx                      Root: fonts, splash, persistent canvas, screen + modal switch
src/
  core/        PURE, deterministic game logic (no React, no three) — unit tested
    rng.ts            mulberry32 seeded RNG + hashing
    config.ts         gameplay constants (track, crowd, battle, sim step)
    types.ts          LevelDef data model (gates, obstacles, rivals, pickups, finish)
    gates.ts          gate operations (+ - x ÷ %, mystery, conditional, timed)
    dilemmas.ts       gate "dilemma" designer (choices that depend on your count)
    difficulty.ts     infinite difficulty curves
    worlds.ts         8 base worlds + infinite remix worlds, mutators
    levelGen.ts       procedural level assembler (patterns), tutorial level
    formation.ts      sunflower crowd formation
    simulation.ts     headless deterministic simulation (collisions, battles, finish)
    bot.ts            planner/random bots for tests & balancing
  meta/        PURE meta-progression — unit tested
    save.ts           schema, defaults, sanitize, migrations, checksum
    economy.ts        all reward/cost formulas
    missions.ts       daily/weekly missions + infinite achievements
    daily.ts          7-day login calendar
    chests.ts         deterministic chest rolls
    skins.ts          skin catalog
    progression.ts    run results → save, claims, purchases, daily challenge
    time.ts           local day/week keys
  services/    Side effects behind small facades
    storage.ts        persistence (coalesced writes, backup, recovery)
    audio.ts          SFX pools + music channel (crossfades, ducking, one track per world mood)
    haptics.ts        throttled haptics
    analytics.ts      privacy-first event queue with pluggable sinks
    ads/              AdService facade, AdMob provider, dev simulator, frequency policy
    iap/              IapService facade, StoreKit provider, dev sandbox, catalog/entitlements
    platform.ts       capability detection (Expo Go, native modules)
  render/      three.js world, driven imperatively (no per-entity React)
    GameController.ts sim ↔ visuals ↔ audio/haptics bridge, fixed-step loop
    GameCanvas.tsx    the single r3f Canvas; r3f(.native).ts picks the right entry
    LevelView.ts      track, decor, gates, obstacles, pickups, rivals, finish stalls
    CrowdView.ts      instanced crowd (2 draw calls + shadows for up to 220 members)
    characters.ts     procedural character + accessory geometry per skin
    Fx.ts             pooled particles, knocked-out flyers, floating texts
    CameraRig.ts      follow camera (menu / play / finish / showcase / chest), shake, FOV punch
    ChestStage.ts     3D chest-opening stage: 3 procedural chests, drop/tap/charge/burst, rays, coin & gem bursts
    text3d.ts         smooth extruded 3D text in Lilita One (fonts/lilita.json, scripts/gen-font.js)
    environment/      world scenery: kits.ts (props of the 8 worlds), build.ts (ground, prop rows,
                      edges, "WC 150M" signs, giant restroom landmark, sky)
    geo.ts            geometry merging, pill badges, sky dome
  state/       store.ts (tiny external store), app.ts (UI state), hud.ts (high-freq HUD), actions.ts
  ui/          theme, i18n (en/fr), components/kit, screens/*
scripts/       gen-audio.js (SFX), gen-music.js (soundtrack), balance.ts, make-save.ts, release-check.js, promo/
__tests__/     Jest suites
assets/        icon, splash, generated audio
```

## 3. Data flow

```
 touch ──► PlayScreen ──► game.drag()          ┌──────────── actions.ts ◄── screens (buttons)
                              │                 │      ▲            │
                              ▼                 │      │ onEnd       ▼
 generateLevel(n) ─► Simulation.step(1/60) ──► events ─┘        meta/* (pure) ──► persistSave()
                              │                                      │
                              ▼                                      ▼
                LevelView / CrowdView / Fx / CameraRig          app store ──► React UI
                (three.js, read sim state each frame)           hud store ──► HUD (≈15 Hz)
```

* The **Simulation** is the single source of truth. It never knows about rendering. The renderer reads its
  state and consumes its events (`gate`, `loss`, `battleStart`, `stall`, `won`…), which also drive audio,
  haptics and analytics.
* Gameplay runs at a **fixed 60 Hz step** with an accumulator (max 5 steps/frame → no spiral of death).
  Identical inputs produce identical results on every device, which is what makes the bot tests meaningful.
* High-frequency values go to a separate `hud` store throttled to ~15 Hz so React never re-renders at 60 fps.

## 4. Performance design

| Topic | Technique |
|---|---|
| JS budget (iOS) | Hermes has no JIT and every draw call / GL call / native call runs on the JS thread, so the budget is **JS time per frame**, measured with a real Hermes VM against a stub GL context (`frame()` + `renderer.render()`): ≈ 0.6–0.9 ms of game logic + ≈ 3–4 ms of three.js for ~75 draw calls (level 25). |
| Crowd | Body + both legs (one InstancedMesh, 2 instances per member) + blob shadow: **3 draw calls for 220 animated characters**. Instance matrices are written by hand (no Euler/quaternion/compose), checked against the three.js math in `__tests__/crowdview.test.ts`. Skin colors baked as vertex colors. |
| View distance | Camera far plane = 190 m, just past the fog end; the sky (dome, clouds, stars, moon) follows the camera and is scaled ×0.55 so it stays inside. Nothing visible changes, but everything beyond the fog is culled instead of drawn. |
| Text | Labels that rarely change (gate values, floating "+15") are baked into **one mesh** per label; counters that change every frame keep one shared-glyph mesh per character (no rebuild). Static baked labels are cached across levels. |
| Audio (iOS) | Every expo-audio `play()` is a synchronous native call that also re-activates the audio session. SFX players are pre-rewound after use (no seek/rate change at play time), pitch variants are preset players, minor sounds share a per-second budget, and battles use ONE looping brawl sound. |
| Count vs visuals | Up to 220 simulated & rendered members; beyond that each member represents `count / 220` people and losses are weighted, so the number shown always matches what you see happen. |
| Level geometry | Track and static props merged into **one indexed vertex-colored mesh**; every scenery prop type is **one InstancedMesh** (+1 for its unlit "glow" parts: windows, screens, lamps). A fully decorated level ≈ 250–340k vertices, ~150–220 meshes (most are frustum-culled gate/label glyphs). |
| Effects | Pooled instanced particles (360) and flyers (70); no allocation during gameplay. |
| Materials/lighting | Lambert + hemisphere + one directional light; **no shadow maps** (soft blob shadows). Fog hides far geometry. |
| Memory | Each level's GPU resources are disposed on level change (including instanced buffers). Shared glyph/character geometries are cached once. |
| Battery | Render loop **stops** while backgrounded (`frameloop="never"`), the run auto-pauses, music suspends. |
| Adaptive quality | `Auto` quality picks DPR by device; a frame-time monitor steps down (high → medium → low) if frames stay >26 ms for 4 s. |
| Collisions | Per-member tests only for obstacles within the crowd's z window; O(members × nearby obstacles). |
| Level build | `mergeParts` transforms straight from the source arrays (no clone); ~0.3–0.6 s per level under Hermes (was 1.1–1.8 s). |

## 5. Save system

`meta/save.ts` + `services/storage.ts`
* Envelope `{v, c: checksum, d: json}`; written to a primary key **and** a backup key.
* Load order: primary → backup → fresh default (corruption never crashes the game).
* `migrateSave` runs versioned migrations (v1 → v2 example included), then `sanitizeSave` validates every
  field (types, ranges, unknown skins, invalid dates) so tampered/partial data cannot break the app.
* Writes are coalesced (one in flight, latest wins) and flushed when the app goes to background.
* Closing the app mid-run: the level simply restarts next time (standard for the genre); progress, currencies
  and purchases are never at risk because they are only written on discrete events.

## 6. Offline

Everything (gameplay, progression, saves, daily rewards, missions, challenges) works offline. Only ads and
IAP need the network; both fail gracefully (buttons hidden or a clear message, no crash, no lost purchase:
unfinished StoreKit transactions are replayed and granted idempotently on next launch).
