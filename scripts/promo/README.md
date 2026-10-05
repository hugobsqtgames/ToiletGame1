# App Store preview — pipeline

The promo film is made **only from the real app**: every gameplay/UI image comes from the production web export of
the game, filmed frame by frame. Nothing is mocked or invented; titles reuse the app's own copy where possible.

```
capture.js  ──►  .promo/clips/<clip>/00001.jpg… + meta.json (game state + SFX log per frame)
                 (real app, virtual clock, 30 fps, 886×1920)
render.js   ──►  compose.html (timeline locked to the game music) ─► frames ─► ffmpeg
                 + audio mix (game music + the game's own SFX in sync)  ─►  docs/preview/*.mp4
```

## Run it

```bash
# 0. tools (not app dependencies): Playwright + serve-handler in a scratch folder, a Chromium binary
npm i --prefix /tmp/pw playwright serve-handler && export NODE_PATH=/tmp/pw/node_modules
# 1. production web build with debug hooks (never ship this build)
EXPO_PUBLIC_DEBUG_HOOKS=1 npx expo export --platform web --output-dir .promo/web
# 2. seeded saves
mkdir -p .promo/saves
for p in "l86 LEVEL=86 START=2" "l45 LEVEL=45 SKIN=robot" "daily LEVEL=25 DAILY=open" \
         "w5 LEVEL=5" "w15 LEVEL=15" "w25 LEVEL=25" "w35 LEVEL=35" "w45 LEVEL=45" "w55 LEVEL=55" "w65 LEVEL=65" "w75 LEVEL=75"; do
  set -- $p; n=$1; shift; env DAILY=claimed QUALITY=high "$@" npx tsx scripts/make-save.ts > .promo/saves/$n.json
done
# 3. film the clips (≈ 25 min with software GL; clips can run in parallel processes)
node scripts/promo/capture.js all
# 4. render EN + FR (≈ 5 min each)
node scripts/promo/render.js all          # --preview: fast low-res draft
```

## How the real app is filmed (`timecap.js`, `capture.js`)
* A **virtual clock** is injected before the app loads: `performance.now`, `Date`, `requestAnimationFrame`,
  `setTimeout/setInterval` run on virtual time. Boot and menus run in real time; while filming, time advances
  exactly 1/30 s per frame, so footage is perfectly smooth however slow the software renderer is (≈0.5 s/frame).
* The game is driven like a player: real taps on real buttons (`data-testid`), steering through the game
  controller (planner autopilot, or a forced lane for the x5 gate). `debugFastForward` skips the boring parts
  between shots (cuts happen there).
* Each frame logs the game state (`phase`, `x`, `z`, `count`) and every sound the game starts with its virtual
  timestamp, so the edit can find moments ("first frame past z = 102") and replay the game's own SFX in sync.

## Analysis that drove the storyboard
* **Most visual screens**: gate rows with big labels (+90 / x5 / −9), the crowd exploding through a multiplier,
  rival battles ("FIGHT!"), the finish corridor of stalls x1→x10 with the golden throne, the 8 themed worlds, the
  live 3D skin preview (Golden Throne), the epic chest opening, the home screen (the 3D level *is* the menu).
* **Best user journey**: home → PLAY → level card → swipe → gates → obstacles → rivals → finish → results.
* **Animatable without touching the app**: phone staging, camera on the footage (push-ins, focus punches,
  speed ramps), kinetic titles, background tinted with each world's real UI colors.
* **Never modified**: the app's screens, HUD, numbers, 3D, fonts and colors are shown exactly as rendered.
  The compositor only frames them. Brand tokens reused: Lilita One + Nunito, `#2B7BFF` blues, gold `#FFC83D`,
  PLAY green `#3BD16F`, white titles with the `#1A3FA8` drop shadow, and the same iPhone frame as the
  screenshots (`scripts/mockups/board.html`).

## Storyboard (29.97 s · 128 BPM · 1 bar = 1.875 s · cuts on the beat)

| Time | Bar | Story beat | Picture | Title (EN / FR) |
|---|---|---|---|---|
| 0.00–1.88 | 1 | **Problem** | Deep navy, kinetic type; music muffled | *Half-time. / One restroom.* — *Mi-temps. / Un seul WC.* (Stadium world tagline) |
| 1.88–3.75 | 2 | **Hook** | Rounded-mask reveal → full-screen level 86, crowd hits **x5** (17 → 85), focus punch on the beat; music opens | *Everybody gotta go!* — *Tout le monde doit y aller !* (app tagline) |
| 3.75–6.56 | 3–4½ | **Discovery** | The screen shrinks into the iPhone (3D tilt), app icon + LOO RUSH lockup, home screen, real tap on PLAY, the app's own camera move and level card | *Swipe · Multiply · Rush* |
| 6.56–10.31 | 4½–6½ | **Core loop** | Fly back into the game: start line, swipes (touch indicator mirrors the real steering), −2/x2 then x5/+20 rows, focus punches, light speed ramp | *Swipe to steer.* → *Pick the right gate.* |
| 10.31–13.13 | 6½–8 | **Feature: obstacles** | Whip-pan → museum level 45, giant plungers | *Dodge the chaos.* |
| 13.13–15.94 | 8–9½ | **Feature: rivals** | Whip-pan → red rival crowd, "FIGHT!", counts dropping | *Outnumber the rivals.* |
| 15.94–18.75 | 9½–11 | **Payoff** | Whip-pan → finish corridor (speed-ramped 1.9×), 3.2K runners, stalls, golden throne, "MADE IT!" results | *Rush to the throne.* |
| 18.75–22.50 | 11–13 | **Experience: worlds** | Results shrink into the iPhone; one world per beat (8 beats), background takes each world's UI colors, world-name chip | *8 worlds.* + *Endless levels.* |
| 22.50–26.25 | 13–15 | **Experience: collection** | Phone A: live 3D Golden Throne skin; phone B slides in: epic chest opening | *Collect skins.* → *Open chests.* |
| 26.25–29.97 | 15–16 | **Call to action** | App icon spring, LOO RUSH, tagline, green PLAY-style button, home screen rising; fade to brand blue on the last beat | *PLAY FREE* — *JOUE GRATUIT* |

Sound: the game's `music_game` track (exactly two loops), low-passed during the problem bar; every gate, coin,
battle, stall and win sound is the game's own SFX at the moment it happened in the footage; transitions use the
game's `whoosh`, the icon reveal its `flush`.

## Output / App Store specs
`docs/preview/loo-rush-preview-{en,fr}.mp4`: 886×1920 portrait (iPhone 6.9" app preview size), 30 fps,
H.264 High, ~10 Mb/s, AAC 256 kb/s 44.1 kHz stereo, 29.97 s (limit: 15–30 s), plus `poster-{en,fr}.jpg`.
App Store Connect accepts the same file for the 6.9"/6.5" slots; it is scaled for smaller iPhones.
Apple's guidelines ask previews to show captured app footage: everything on the phone screens is the app;
the device frame and titles are overlays (allowed: "text overlays and device frames" are a common pattern, but if
review asks for full-screen footage only, set the `d` (device) values in compose.html to 0 — the morph system
already renders every shot full-screen at `d = 0`).
