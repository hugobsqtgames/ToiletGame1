# Regenerating the mockups

Requires Playwright + serve-handler (not app dependencies): `npm i -D playwright serve-handler` in a scratch folder
or globally, and a Chromium (`PLAYWRIGHT_BROWSERS_PATH`).

1. `EXPO_PUBLIC_DEBUG_HOOKS=1 npx expo export --platform web --dev --output-dir .mockups/webdev`
2. Create the seeded saves: `DAILY=open QUALITY=high LEVEL=25 npx tsx scripts/make-save.ts > .mockups/s25o.json`
   (and `s25c` claimed, `s20`, `s45 SKIN=robot`, `s57 SKIN=chef`, `s86 START=2`; see `SAVES` in cap.js).
3. `node scripts/mockups/cap.js all` → `.mockups/shots/*.png` (real app captures).
4. Copy `board.html` + `LilitaOne_400Regular.ttf` into `.mockups/board/`, downscale shots into
   `.mockups/board/img/*.jpg`, then `node scripts/mockups/board.js`.

`EXPO_PUBLIC_DEBUG_HOOKS=1` exposes `globalThis.__game` (autoplay, fast-forward, freeze) and the `?insets=` safe-area
simulation. Never set it for store builds (eas.json sets it to 0).
