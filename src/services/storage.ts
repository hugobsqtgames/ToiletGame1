import AsyncStorage from '@react-native-async-storage/async-storage';
import { decodeSave, defaultSave, encodeSave, type SaveData } from '../meta/save';
import { log } from './log';

/**
 * Persistent save with:
 *  - checksum envelope (detects truncation/corruption),
 *  - a backup copy written after every successful write (crash-safe),
 *  - migrations + sanitizing (see meta/save.ts),
 *  - write coalescing (at most one write in flight, latest wins).
 */
const KEY = 'loorush.save';
const BACKUP = 'loorush.save.bak';

export type LoadSource = 'primary' | 'backup' | 'new' | 'recovered-default';

export async function loadSave(now = Date.now()): Promise<{ save: SaveData; source: LoadSource }> {
  let primary: string | null = null;
  let backup: string | null = null;
  try {
    [primary, backup] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(BACKUP)]);
  } catch (e) {
    log.warn('storage read failed', e);
  }
  const p = decodeSave(primary, now);
  if (p) return { save: p, source: 'primary' };
  const b = decodeSave(backup, now);
  if (b) {
    log.warn('primary save unreadable, restored backup');
    return { save: b, source: 'backup' };
  }
  if (primary || backup) {
    log.warn('both saves unreadable, starting fresh');
    return { save: defaultSave(now), source: 'recovered-default' };
  }
  return { save: defaultSave(now), source: 'new' };
}

let pending: SaveData | null = null;
let writing: Promise<void> | null = null;

async function flushLoop() {
  while (pending) {
    const data = pending;
    pending = null;
    const text = encodeSave({ ...data, updatedAt: Date.now() });
    try {
      await AsyncStorage.setItem(KEY, text);
      await AsyncStorage.setItem(BACKUP, text);
    } catch (e) {
      log.warn('storage write failed', e);
    }
  }
  writing = null;
}

/** Queues a write; resolves when everything queued so far is on disk. */
export function persistSave(save: SaveData): Promise<void> {
  pending = save;
  if (!writing) writing = flushLoop();
  return writing;
}

export async function wipeSave(): Promise<void> {
  pending = null;
  if (writing) await writing;
  await AsyncStorage.multiRemove([KEY, BACKUP]);
}
