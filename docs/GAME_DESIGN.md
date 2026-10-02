# Game design

## Concept
**LOO RUSH — "Everybody gotta go!"** A crowd of goofy *Loonies* (googly eyes, arms up in panic) races to the
restroom. Family-friendly absurd humor: wet-floor signs, runaway toilet paper, giant plungers, queue jumpers,
and a golden Royal Throne at the end. Never vulgar.

## Core loop (30–45 s)
1. Home is the level itself: the crowd waits at the START arch. Tap **PLAY**, then **drag** to run.
2. The crowd runs automatically; horizontal drags steer it (relative drag, first finger only).
3. Gate rows change the count; obstacles knock members out; rival crowds fight you (both sides shrink).
4. The **finish corridor** has 10 pairs of stalls (x1 → x10). Each stall pair consumes members; the last stall
   reached is the reward multiplier. Reaching the finish line with ≥1 member is a victory.
5. Results → coins (+ optional ×3 rewarded ad) → chest meter, missions, challenges → NEXT.

Level 1 is a hand-made tutorial (drag hint → "Run through the best gate!" → multiplier → "Dodge the obstacles!"
→ finish). New mechanics get a **NEW!** card before the level starts.

## Gates (choices, not "always the biggest number")
| Gate | Example | Notes |
|---|---|---|
| Add / Subtract | `+15`, `-20` | |
| Multiply / Divide | `x3`, `÷2` | |
| Percent | `+50%`, `-30%` | |
| Timed | blinks `x3` ↔ `÷2` | timing skill |
| Mystery | `?` | hidden content, ~60% good |
| Conditional | `<40 x3 / -30%` | depends on your current count |
| Moving rows | whole row slides | can be missed entirely |

Rows are built by `core/dilemmas.ts` from the generator's estimate of your crowd `E`:
* **add vs mul**: `+a` vs `xk` with `a ≈ E·(k−1)·tie` → which is better depends on *your* count.
* **two bad**: `-a` vs `÷2` → pick the lesser evil.
* **risk vs reward**: a big multiplier guarded by a hazard vs a guaranteed bonus.
* **jackpot** (the level's spectacular moment, 55–80% of the track): `x5`/`x10` vs a safe add.
* Hardness (how close options are) grows with level; inflation control favours additive/negative choices when
  the expected crowd is already large.

## Obstacles
Walls ("out of order"), spinning mops, cleaning carts, wet-floor puddles (holes), runaway toilet-paper rolls,
giant plungers (telegraphed by a red ring), hand dryers (push you sideways), cardboard boxes (cost members,
hide stragglers), VIP turnstiles (need N+ members, label turns green/red live), rival crowds.
Members die only on real geometric overlap; dead slots leave holes that close after 0.45 s (a wall cuts a
slice, it does not "eat" the whole crowd). Big crowds are wider → walls cost more → real trade-off.

## Infinite progression
* `generateLevel(n)` is a **pure function of n** (seeded). No modulo, no table of levels: level 10 000 is a new
  combination of patterns, parameters and mutators. Tested from level 1 to 3000 plus 10 000, 123 456 and
  9 999 999.
* **Difficulty** (`core/difficulty.ts`): speed, duration, pattern gap, hazard density, dilemma hardness, rival
  ratio, obstacle motion and combo probability are smooth saturating curves, plus an unbounded logarithmic
  *pressure* term after level 150, so it keeps getting harder forever while staying physically playable.
* **Fairness is verified by bots** (`core/bot.ts`, `npm run balance`): a planner bot wins 100% of levels 2–80,
  ~80% at 100–240, ~70% at 1000+, and 90–100% with one revive; a random bot almost always loses
  (decisions matter). Rival sizes use a blend of optimistic and pessimistic crowd estimates.

## Worlds (10 levels each, level 10 = boss)
| # | World | Introduces |
|---|---|---|
| 1 | Mall Mayhem | + / x gates, walls, − gates, stragglers |
| 2 | Stadium Stampede | ÷ gates, spinning mops, rival crowds |
| 3 | Airport Dash | cleaning carts, timed gates, hand dryers |
| 4 | Splash Park | puddles, % gates, toilet-paper rolls |
| 5 | Museum Madness | plungers, mystery gates, box piles |
| 6 | Space Station | conditional gates, moving gates, VIP turnstiles |
| 7 | Royal Rush | everything, bigger rivals |
| 8 | Spooky Manor | everything + fog |
| 9+ | **Remix worlds** (e.g. "Mall Mayhem II") | new palette, all mechanics, 1–3 mutators (Rush Hour, Butterfingers, Rivalry, Foggy, Mystery, Tight, Windy), harder curves |

Each base world has its own palette, decor set, music mood and a themed skin unlocked on arrival.

## Economy
* **Coins** (soft): level rewards `levelBase(L) × crowdFactor(log) × stall^0.7 × income`, consolation on
  defeat, coin trails, missions, chests, daily rewards. Spent on upgrades and common/rare skins.
* **Gems** (premium, rare): challenges, missions, daily day 4/7, chests, IAP. Spent on epic skins, revives
  (15), coin packs. Kept scarce so they feel valuable; nothing gameplay-critical is gem-only.
* **Keys**: found on ~1/3 of levels; 3 keys = Key Chest.
* Upgrades: *Start Crowd* (+2 runners/level, max 60) and *Income* (+8%/level, max 50), exponential costs.
  They help but never replace good decisions (not pay-to-win; no upgrade is sold for money).

## Retention systems
* Chest meter: every 4 wins → Plunger Chest. Golden chests from day 7 / achievements.
* Daily rewards: 7-day loop (coins, coins, chest, gems, coins, keys, golden chest + gems); a missed day restarts
  the streak (best streak kept); device clock rollbacks are ignored.
* Missions: 3 daily + 3 weekly (seeded by date, only missions you can actually do at your level).
* Achievements: 8 tracks with **infinite tiers** (targets and rewards grow forever).
* Level challenges (every 3rd level from level 4): finish with N+, lose at most N, never take a bad gate,
  take a xN gate, reach N → gems.
* Daily Challenge: a date-seeded special level with 1–2 mutators, scaled to your level; first win of the day
  gives gems + a key; best score kept.

## Endgame
Infinite levels and remix worlds, infinite achievements, daily challenge, best crowd/best finish records,
skin collection (19 skins incl. chest-only and legendary). Architecture is ready for Game Center leaderboards
(best finish / level are already tracked in `stats`).

## Design review (step 44 answers)
* **Fun / clear?** Two taps to play, one gesture, numbers explode visibly, every action has sound + particles +
  haptics. Tutorial texts are 4–5 words.
* **Repetitive?** Mechanics arrive one world at a time; remix worlds add mutators; the jackpot moment and
  boss rival give each level a shape.
* **Real choices?** Yes: dilemma rows are near-ties whose answer depends on your count, timing or risk.
* **Monetization reasonable?** No ad before level 5, interstitials only between runs, every 3 runs, 2-min
  cooldown, none right after a rewarded ad/purchase. Rewarded ads always optional.
* **Too many screens?** Home reveals features progressively (upgrades from level 2, No-Ads chip from 3,
  challenges from 4, daily popup from 2).
