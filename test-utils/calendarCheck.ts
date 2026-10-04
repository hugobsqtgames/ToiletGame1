/**
 * Calendar checks run in a child process with a given TZ (see stress.meta.test.ts).
 * Prints "OK <zone>" or throws with the first failure.
 */
import { claimDaily } from '../src/meta/daily';
import { refreshMissions } from '../src/meta/missions';
import { defaultSave } from '../src/meta/save';
import { dayDiff, dayKey, isValidDayKey, msUntilNextWeek, msUntilTomorrow, weekKey } from '../src/meta/time';
import { Rng } from '../src/core/rng';

const DAY = 86_400_000;
const zone = process.env.TZ ?? 'local';
const check = (ok: boolean, msg: string) => {
  if (!ok) throw new Error(`[${zone}] ${msg}`);
};

// 1. dayKey advances exactly once per local day (2024 → 2031, DST included).
let prev = dayKey(new Date(2024, 0, 1, 12).getTime());
for (let d = 1; d < 365 * 7; d++) {
  const k = dayKey(new Date(2024, 0, 1 + d, 12).getTime());
  check(isValidDayKey(k), `invalid day key ${k}`);
  check(dayDiff(prev, k) === 1, `dayDiff ${prev} -> ${k}`);
  prev = k;
}

// 2. weekKey changes only on Mondays, never reuses a key, increases (2024 & 2029 start on Monday).
{
  const seen = new Set<string>();
  let p = '';
  for (let d = 0; d < 365 * 7; d++) {
    const date = new Date(2024, 0, 1 + d, 12);
    const k = weekKey(date.getTime());
    check(/^\d{4}-W\d{2}$/.test(k), `bad week key ${k}`);
    if (k !== p) {
      if (p) check(date.getDay() === 1, `week changed on a ${date.toDateString()} (${p} -> ${k})`);
      check(!seen.has(k), `week key ${k} reused on ${date.toDateString()}`);
      if (p) check(k > p, `week key went backwards ${p} -> ${k}`);
      seen.add(k);
    }
    p = k;
  }
}

// 3. weekKey stable at every hour of weeks containing DST switches.
for (const start of [new Date(2026, 2, 23), new Date(2026, 9, 19), new Date(2026, 3, 6), new Date(2026, 8, 28), new Date(2029, 2, 19), new Date(2029, 2, 26)]) {
  const k0 = weekKey(start.getTime() + 1000);
  for (let h = 1; h < 24 * 7 - 2; h++) check(weekKey(start.getTime() + h * 3_600_000) === k0, `week unstable at ${start.toDateString()} +${h}h`);
}

// 4. countdowns are positive and bounded.
{
  const rng = new Rng(zone.length);
  const base = new Date(2026, 0, 1).getTime();
  for (let i = 0; i < 3000; i++) {
    const t = base + rng.int(0, 1500) * DAY + rng.int(0, DAY);
    const a = msUntilTomorrow(t), b = msUntilNextWeek(t);
    check(a > 0 && a <= 25 * 3_600_000, `msUntilTomorrow ${a}`);
    check(b > 0 && b <= 7 * DAY + 3_600_000, `msUntilNextWeek ${b}`);
    check(dayKey(t + a) !== dayKey(t), 'tomorrow countdown lands on the same day');
  }
}

// 5. a year of daily claims at random hours: streak advances every day.
{
  const rng = new Rng(7);
  let s = defaultSave(Date.now());
  for (let d = 0; d < 365; d++) {
    const t = new Date(2026, 0, 1 + d, rng.int(0, 23), rng.int(0, 59)).getTime();
    const c = claimDaily(s, t);
    check(!!c && c.dayIndex === d % 7, `daily claim day ${d}`);
    s = c!.save;
    check(claimDaily(s, t + 1000) === null, `double claim day ${d}`);
  }
  check(s.daily.streak === 365, 'streak');
}

// 6. weekly missions refresh every single week for 7 years.
{
  let s = refreshMissions(defaultSave(Date.now()), new Date(2024, 0, 1, 12).getTime());
  for (let w = 1; w < 52 * 7; w++) {
    const prevKey = s.missions.weeklyKey;
    s = { ...s, missions: { ...s.missions, weekly: s.missions.weekly.map((m) => ({ ...m, claimed: true })) } };
    s = refreshMissions(s, new Date(2024, 0, 1 + w * 7, 12).getTime());
    check(s.missions.weeklyKey !== prevKey, `weekly missions did not refresh in week ${w} (${prevKey})`);
    check(s.missions.weekly.every((m) => !m.claimed), 'weekly missions still claimed');
  }
}

console.log(`OK ${zone}`);
