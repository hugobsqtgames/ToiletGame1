import { plannerBot } from '../src/core/bot';
import { generateLevel } from '../src/core/levelGen';
import { Simulation } from '../src/core/simulation';
const [a,b] = (process.argv[2]).split(',').map(Number);
let w1=0,w2=0,n=0;
for (let L=a; L<b; L++) { const def=generateLevel(L); n++;
  if (plannerBot(new Simulation(def), {horizon: 2.6}).won) w1++;
  if (plannerBot(new Simulation(def), {revive: true}).won) w2++;
  }
console.log(`L${a}-${b}: longer-horizon ${w1}/${n}  with-revive ${w2}/${n}`);
