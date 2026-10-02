/* Checks that rival crowds cannot be dodged: counts battles vs rivals per level with the planner bot. */
import { plannerBot } from '../src/core/bot';
import { generateLevel } from '../src/core/levelGen';
import { Simulation } from '../src/core/simulation';
let rivals = 0, battles = 0, wins = 0;
for (let L = Number(process.argv[2] ?? 11); L < Number(process.argv[3] ?? 61); L++) {
  const def = generateLevel(L);
  const sim = new Simulation(def);
  const step = sim.step.bind(sim);
  let b = 0;
  sim.step = (dt: number) => { const before = sim.s.phase; step(dt); if (before !== 'battle' && sim.s.phase === 'battle') b++; };
  const r = plannerBot(sim);
  rivals += def.rivals.length; battles += b; wins += r.won ? 1 : 0;
}
console.log(`rivals ${rivals} battles ${battles} wins ${wins}`);
