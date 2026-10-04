# Test battery

`npm test` runs every Jest suite. All random cases are **seeded** (mulberry32), so any failure is reproducible
from the seed printed in its message.

| Suite | What it hammers |
|---|---|
| `__tests__/core.test.ts`, `meta.test.ts` | Original unit tests (gates, generator, simulation, bots, save, daily, missions, ads, IAP). |
| `__tests__/stress.math.test.ts` | Gate math exhaustively (every op × boundary counts) + 20 000 random ops, labels vs 3D font glyphs, number formatting, RNG uniformity (χ²), hash collisions, formation spacing. |
| `__tests__/stress.levels.test.ts` | **Every level 1–200 individually**, levels 201–20 000 in chunks, extreme/garbage level numbers (0, −1, NaN, ∞, 2⁴⁰), a year of daily challenges, 40 worlds. ~30 structural invariants per level (unique ids, gate rows span the track, no wall on a gate row, sorted pickups, announced mechanics really present, boss present on boss levels…). |
| `__tests__/stress.sim.test.ts` | **Monkey players** (random, jitter, hostile NaN/∞ input, edge-hugging, idle) on 64 levels + daily challenges; invariants checked after **every 1/60 s step** (integer bounded count, legal phase transitions, dead-slot bitmap, events consistency, no stuck run, finished sim inert). Determinism, clone fidelity, revive rules, crowds up to 9 999 999, hostile frame times, performance budgets, every base-world boss winnable. |
| `__tests__/stress.meta.test.ts` | Save fuzzing (5 000 mutated saves, 3 000 random values, byte flips, every truncation, prototype pollution, newer-version saves), sanitizer idempotence, **40 monkey players × 400 random meta actions** (runs, claims, chests, shop, IAP, restarts, clock jumps/rollbacks) with a "save stays healthy" invariant, clock tampering, ad-policy timelines, IAP replay/restore fuzzing, economy monotonicity, chests, missions, achievements, skins, and a **calendar check in 12 time zones** (run in child processes with `TZ` set, 2024–2031, DST). |
| `__tests__/stress.content.test.ts` | en/fr key + placeholder parity, every `t()`/dynamic key exists, 3D font coverage of every in-game string, **gate labels fit their panel for levels 1–3000**, scenery of 16 worlds never intrudes on the track (vertex-exact) and stays within the vertex/draw-call budget, every skin's character geometry, storage service (corruption → backup, failures, coalescing, migration), analytics queue, source hygiene (no Node APIs, no debug leftovers, no secrets). |

## UI monkey (Playwright, not part of `npm test`)

A production web export (with `EXPO_PUBLIC_DEBUG_HOOKS=1`) is driven by a seeded monkey: random taps on visible
buttons, random taps/drags anywhere, triple taps, background/foreground, page reloads (app kill), waits. It
reports page errors, console errors, `NaN`/`undefined`/`Infinity` rendered on screen, blank screens, stuck runs
and corrupted saves. See docs/QA.md for the latest results.
