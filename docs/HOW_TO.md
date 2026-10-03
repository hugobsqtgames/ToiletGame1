# How to extend the game

Everything content-related is data or a small pure function. After any change run
`npm run typecheck && npm run lint && npm test` (tests generate 3000+ levels and replay many with bots).

## Add a world
Base worlds live in `BASE_THEMES` (`src/core/worlds.ts`):
1. Add an entry: `id`, `name`/`tagline` (en/fr), `colors` (sky, fog, floor tiles, rail, wall, accent, UI
   gradient), `introduces` (mechanics first featured there), `music` mood.
2. Add its environment kit in `kitFor()` (`src/render/environment/kits.ts`): ground style/colors, `near` / `mid` /
   `far` prop lists (primitives with baked colors, front facing +X, optional unlit `glow` parts), sky and track
   edge style. The builder places, mirrors, instances and keeps props off the track automatically.
3. Optionally add a themed skin with `unlock: { type: 'world', world: N }` (`src/meta/skins.ts`).
Remix worlds (all worlds after the base list) are automatic: palette shift + mutators.

## Add a level pattern ("new level" content)
Levels are not stored: they are assembled from patterns in `src/core/levelGen.ts`.
1. Write `function myPattern(g: Gen) { ... }` that pushes rows/obstacles/pickups/rivals between `g.z` and
   `g.z + length`, calls `markUsed(g, ...mechanics)`, updates the expected crowd with `setE(g, newE)`, and
   advances `g.z`.
2. Call it from the main loop or `hazardPattern`/`bonusPattern` with a weight that depends on `g.P` (difficulty)
   and `g.mech` (unlocked mechanics).
3. Run `npm run balance -- 2,20,100,500,5000 10` and check the planner bot still wins most levels.
A hand-authored level is possible too: see `tutorialLevel()`.

## Add a gate type
1. Add the variant to `GateOp` in `src/core/types.ts`.
2. Handle it in `applyOp`, `gateTone`, `gateLabelLines` (`src/core/gates.ts`) — the TypeScript `switch` will
   force you to cover every place.
3. Use it in a dilemma in `src/core/dilemmas.ts` (and `estimateOption` for the generator's estimate).
4. Add its mechanic id to `MechanicId`, a `mech_*` string in `src/ui/i18n/en.ts` + `fr.ts`, and the world that
   introduces it.

## Add an obstacle
1. Add the kind to `ObstacleKind` (`src/core/types.ts`).
2. Collision: add a case in `Simulation.checkObstacles` (`src/core/simulation.ts`) using `membersInBox`,
   `membersInEllipse` or `membersInRotatedBar`; time-based motion helpers live next to `sliderX`.
3. Visuals: add a case in `LevelView.buildObstacle` (static parts → `out`, moving parts → a group + a `dyn`
   updater reading the same motion helper as the simulation).
4. Generate it in `hazardPattern` (and `guardLane` if it can guard a reward). Add `mech_*` strings.

## Add a skin
Add one entry to `SKINS` (`src/meta/skins.ts`): colors (`body`, `legs`, `skin`), an `accessory`
(existing ids or a new one in `accessoryParts()` of `src/render/characters.ts`), `rarity` and `unlock`
(`coins`, `gems`, `chest`, `world`, `iap`). The shop tile, 3D crowd, chest drops and save validation pick it up
automatically.

## Add a reward
Rewards are the `Reward` type (`coins`, `gems`, `keys`, `chest`, `skin`) granted by `grantReward()`
(`src/meta/progression.ts`). To add a new currency/item: extend `Reward`, `grantReward`, `sanitizeReward`
(`save.ts`) and `RewardChips` (`ui/components/kit.tsx`).

## Add a mission or achievement
* Daily/weekly: add `{ metric, target(level), mode, minLevel? }` to `DAILY_POOL`/`WEEKLY_POOL`
  (`src/meta/missions.ts`). New metrics: add to `MetricId`, feed it in `applyRunResult`'s `delta`, add
  `metric_*` strings.
* Achievement: add to `ACHIEVEMENTS` with `value(save)`, an infinite `target(tier)` and `reward(tier)`, plus
  `ach_*` / `achDesc_*` strings.

## Add an IAP product
Add it to `PRODUCTS` (`src/services/iap/catalog.ts`), create the same ID in App Store Connect, and add a tile in
`ShopModal`. Granting/restoring is generic.

## Add a sound
Add a synth recipe in `scripts/gen-audio.js`, run `node scripts/gen-audio.js`, register it in `SFX`
(`src/services/audio.ts`), then `audio.play('id')`.

## Add a 3D text glyph
In-game 3D text uses Lilita One converted by `node scripts/gen-font.js` into `src/render/fonts/lilita.json`
(only the characters listed in `CHARS`). Add the character to `CHARS` and re-run the script.
