/* QA helper: prints an encoded save envelope for a given profile (used by screenshot/QA scripts). */
import { defaultSave, encodeSave } from '../src/meta/save';
import { refreshMissions } from '../src/meta/missions';
const level = Number(process.argv[2] ?? 25);
const now = Date.now();
let s = defaultSave(now - 20 * 86400000);
s = {
  ...s, level, coins: 4820, gems: 135, keys: 3,
  upgrades: { startCrowd: 6, income: 4 },
  chest: { progress: 2, basic: 2, epic: 1 },
  skins: { owned: ['rookie', 'office', 'tourist', 'chef', 'ref', 'pilot', 'robot'], selected: process.argv[3] ?? 'rookie' },
  daily: { lastClaimDay: null, streak: 0, bestStreak: 4 },
  stats: { ...s.stats, runs: 60, wins: level - 1, bestCrowd: 1840, bestFinish: 960, people: 21000, rivalsDefeated: 14, bigMultipliers: 37, chestsOpened: 6, challenges: 4, perfect: 1 },
  seenMechanics: ['gate_add', 'gate_mul', 'wall', 'gate_sub', 'pickup', 'gate_div', 'sweeper', 'rival', 'slider', 'gate_timed', 'blower'],
  seenWorlds: Math.ceil(level / 10),
};
s = refreshMissions(s, now);
s.missions.daily = s.missions.daily.map((m, i) => (i === 0 ? { ...m, progress: m.target } : { ...m, progress: Math.floor(m.target / 2) }));
process.stdout.write(encodeSave(s));
