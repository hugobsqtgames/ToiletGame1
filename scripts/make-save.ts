/* QA helper: prints an encoded save envelope for a profile (screenshots, manual QA).
   Usage: LEVEL=25 SKIN=rookie DAILY=open|claimed QUALITY=high npx tsx scripts/make-save.ts */
import { defaultSave, encodeSave } from '../src/meta/save';
import { refreshMissions } from '../src/meta/missions';
import { dayKey } from '../src/meta/time';
const env = process.env;
const level = Number(env.LEVEL ?? process.argv[2] ?? 25);
const now = Date.now();
let s = defaultSave(now - 20 * 86400000);
s = {
  ...s, level, coins: 4820, gems: 135, keys: 3,
  upgrades: { startCrowd: Number(env.START ?? 6), income: 4 },
  chest: { progress: 2, basic: 2, epic: 1 },
  skins: { owned: ['rookie', 'office', 'tourist', 'chef', 'ref', 'pilot', 'robot'], selected: env.SKIN ?? process.argv[3] ?? 'rookie' },
  daily: env.DAILY === 'claimed'
    ? { lastClaimDay: dayKey(now), streak: 3, bestStreak: 4 }
    : { lastClaimDay: dayKey(now - 86400000), streak: 2, bestStreak: 4 },
  stats: { ...s.stats, runs: 60, wins: level - 1, bestCrowd: 1840, bestFinish: 960, people: 21000, rivalsDefeated: 14, bigMultipliers: 37, chestsOpened: 6, challenges: 4, perfect: 1 },
  seenMechanics: ['gate_add', 'gate_mul', 'wall', 'gate_sub', 'pickup', 'gate_div', 'sweeper', 'rival', 'slider', 'gate_timed', 'blower', 'puddle', 'gate_pct', 'roller', 'stomper', 'gate_mystery', 'boxes', 'gate_cond', 'gate_moving', 'turnstile'],
  seenWorlds: Math.ceil(level / 10),
  settings: { ...s.settings, quality: (env.QUALITY as 'high') ?? 'auto' },
};
s = refreshMissions(s, now);
s.missions.daily = s.missions.daily.map((m, i) => (i === 0 ? { ...m, progress: m.target } : { ...m, progress: Math.floor(m.target / 2) }));
process.stdout.write(encodeSave(s));
