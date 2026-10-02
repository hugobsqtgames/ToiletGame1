import type { LanguageSetting } from '../../meta/save';
import { en, type Dict } from './en';
import { fr } from './fr';

export type Lang = 'en' | 'fr';
export type StrKey = keyof typeof en;

const dicts: Record<Lang, Dict> = { en, fr };

export function deviceLanguage(): Lang {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
    return loc.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

let current: Lang = deviceLanguage();

export function setLanguage(setting: LanguageSetting) {
  current = setting === 'auto' ? deviceLanguage() : setting;
}

export const getLanguage = () => current;

/** Translates a key, replacing {placeholders}. Falls back to English. */
export function t(key: StrKey, vars?: Record<string, string | number>): string {
  let s: string = dicts[current][key] ?? en[key] ?? String(key);
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

/** Dynamic keys (metrics, achievements...) with a safe fallback. */
export function tk(key: string, vars?: Record<string, string | number>): string {
  return key in en ? t(key as StrKey, vars) : key;
}
