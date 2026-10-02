import { plannerBot } from '../src/core/bot';
import { generateLevel } from '../src/core/levelGen';
import { Simulation } from '../src/core/simulation';
const [a,b] = (process.argv[2] ?? '200,230').split(',').map(Number);
const causes: Record<string, number> = {}; let wins=0, n=0; const ratios:number[]=[];
for (let L=a; L<b; L++) { const def=generateLevel(L); const sim=new Simulation(def); let maxGateGain=0;
  const r = plannerBot(sim); n++; if (r.won) { wins++; ratios.push(r.finishCount/def.expectedFinish);} else { const k = sim.s.lossCause + (sim.s.activeRival>=0? (sim.s.rivals[sim.s.activeRival].boss?'-boss':'-rival'):''); causes[k]=(causes[k]??0)+1; } }
ratios.sort((x,y)=>x-y);
console.log(`L${a}-${b}: win ${wins}/${n}`, causes, 'finish/expected median', ratios[Math.floor(ratios.length/2)]?.toFixed(2));
