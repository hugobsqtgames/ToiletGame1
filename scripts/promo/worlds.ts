/* Prints the real world names / UI colors used by the promo (node scripts/promo/render.js calls it). */
import { getWorld } from '../../src/core/worlds';
import { en } from '../../src/ui/i18n/en';
import { fr } from '../../src/ui/i18n/fr';
const lang = (process.argv[2] ?? 'en') as 'en' | 'fr';
const label = (lang === 'fr' ? fr : en).world;
const out = [1, 2, 3, 4, 5, 6, 7, 8].map((w) => {
  const info = getWorld(w);
  return { name: info.displayName[lang], index: label.replace('{n}', String(w)), ui: info.colors.ui };
});
process.stdout.write(JSON.stringify(out));
