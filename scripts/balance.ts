/* Balancing report: plays sampled levels with the planner and random bots. */
import { plannerBot, randomBot } from '../src/core/bot';
import { generateLevel } from '../src/core/levelGen';
import { Rng } from '../src/core/rng';
import { Simulation } from '../src/core/simulation';

const levels = (process.argv[2] ?? '1,2,3,5,8,10,15,20,30,40,50,75,100,150,200,300,500,1000,5000,20000').split(',').map(Number);
const reps = Number(process.argv[3] ?? 1);
for (const L of levels) {
  let pw = 0, rw = 0, fc = 0, mult = 0, time = 0;
  const t0 = Date.now();
  for (let k = 0; k < reps; k++) {
    const lv = L + k;
    const def = generateLevel(lv);
    const p = plannerBot(new Simulation(def));
    const r = randomBot(new Simulation(def), new Rng(lv * 7));
    pw += p.won ? 1 : 0; rw += r.won ? 1 : 0; fc += p.finishCount; mult += p.multiplier; time += p.timeSec;
  }
  const d = generateLevel(L);
  console.log(`L${L} w${d.world} boss=${d.isBoss} len=${d.length} spd=${d.speed.toFixed(1)} rows=${d.gateRows.length} obs=${d.obstacles.length} riv=${d.rivals.map(r=>r.count).join('/')} exp=${d.expectedFinish} | planner win ${pw}/${reps} fin~${Math.round(fc/reps)} x${(mult/reps).toFixed(1)} t=${(time/reps).toFixed(0)}s | random win ${rw}/${reps} | ${Date.now()-t0}ms`);
}
