/**
 * Character skin catalog. Adding a skin = adding one entry here (the renderer
 * builds everything from these colors + accessory id). See docs/HOW_TO.md.
 */
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type AccessoryId =
  | 'none'
  | 'cap'
  | 'tophat'
  | 'crown'
  | 'helmet'
  | 'antenna'
  | 'chefhat'
  | 'beanie'
  | 'headband'
  | 'duckbill'
  | 'mohawk'
  | 'beret'
  | 'snorkel'
  | 'sunhat'
  | 'bun'
  | 'halo';

export type SkinUnlock =
  | { type: 'default' }
  | { type: 'coins'; price: number }
  | { type: 'gems'; price: number }
  | { type: 'chest' }
  | { type: 'world'; world: number }
  | { type: 'iap'; productKey: 'starter' };

export interface SkinDef {
  id: string;
  name: { en: string; fr: string };
  rarity: Rarity;
  unlock: SkinUnlock;
  body: string;
  /** Legs/shorts color. */
  legs: string;
  skin: string;
  accessory: AccessoryId;
  accColor: string;
  /** Emissive glow for legendary skins. */
  glow?: boolean;
}

export const SKINS: SkinDef[] = [
  { id: 'rookie', name: { en: 'Rookie', fr: 'Débutant' }, rarity: 'common', unlock: { type: 'default' }, body: '#FFD23F', legs: '#2B59C3', skin: '#FFD7B5', accessory: 'cap', accColor: '#2B9BFF' },
  { id: 'office', name: { en: 'Office Hero', fr: 'Héros de Bureau' }, rarity: 'common', unlock: { type: 'coins', price: 400 }, body: '#F4F6FA', legs: '#3B4250', skin: '#F2C49B', accessory: 'none', accColor: '#E63946' },
  { id: 'tourist', name: { en: 'Tourist', fr: 'Touriste' }, rarity: 'common', unlock: { type: 'coins', price: 900 }, body: '#FF8A3D', legs: '#5BC0EB', skin: '#FFD7B5', accessory: 'sunhat', accColor: '#F5DEB3' },
  { id: 'granny', name: { en: 'Speedy Granny', fr: 'Mamie Turbo' }, rarity: 'common', unlock: { type: 'coins', price: 1500 }, body: '#B69CFF', legs: '#7A6CA8', skin: '#F7D9C4', accessory: 'bun', accColor: '#E8E8E8' },
  { id: 'chef', name: { en: 'Chef', fr: 'Chef' }, rarity: 'rare', unlock: { type: 'coins', price: 2500 }, body: '#FFFFFF', legs: '#2F2F2F', skin: '#E8B48A', accessory: 'chefhat', accColor: '#FFFFFF' },
  { id: 'punk', name: { en: 'Punk', fr: 'Punk' }, rarity: 'rare', unlock: { type: 'coins', price: 4000 }, body: '#2D2D2D', legs: '#C2185B', skin: '#FFD7B5', accessory: 'mohawk', accColor: '#7CFF4F' },
  { id: 'ref', name: { en: 'Referee', fr: 'Arbitre' }, rarity: 'rare', unlock: { type: 'world', world: 2 }, body: '#EDEDED', legs: '#111111', skin: '#C68B59', accessory: 'cap', accColor: '#111111' },
  { id: 'pilot', name: { en: 'Pilot', fr: 'Pilote' }, rarity: 'rare', unlock: { type: 'world', world: 3 }, body: '#1F3A93', legs: '#1F2A44', skin: '#F2C49B', accessory: 'cap', accColor: '#FFFFFF' },
  { id: 'diver', name: { en: 'Snorkeler', fr: 'Plongeur' }, rarity: 'rare', unlock: { type: 'world', world: 4 }, body: '#00C2D1', legs: '#FF5E78', skin: '#FFD7B5', accessory: 'snorkel', accColor: '#FFE14D' },
  { id: 'curator', name: { en: 'Art Curator', fr: 'Conservateur' }, rarity: 'rare', unlock: { type: 'world', world: 5 }, body: '#8D5B3E', legs: '#3E2A1E', skin: '#F2C49B', accessory: 'beret', accColor: '#C62828' },
  { id: 'astro', name: { en: 'Astronaut', fr: 'Astronaute' }, rarity: 'epic', unlock: { type: 'world', world: 6 }, body: '#F5F5F5', legs: '#B0BEC5', skin: '#FFD7B5', accessory: 'helmet', accColor: '#9BE7FF' },
  { id: 'king', name: { en: 'Royal Highness', fr: 'Altesse Royale' }, rarity: 'epic', unlock: { type: 'world', world: 7 }, body: '#7B1FA2', legs: '#4A148C', skin: '#FFD7B5', accessory: 'crown', accColor: '#FFD54F' },
  { id: 'ghost', name: { en: 'Boo-dle', fr: 'Fantômou' }, rarity: 'epic', unlock: { type: 'world', world: 8 }, body: '#E8EAF6', legs: '#C5CAE9', skin: '#E8EAF6', accessory: 'halo', accColor: '#9CFF5A' },
  { id: 'robot', name: { en: 'Robo-Loo', fr: 'Robo-WC' }, rarity: 'epic', unlock: { type: 'gems', price: 60 }, body: '#B0BEC5', legs: '#546E7A', skin: '#CFD8DC', accessory: 'antenna', accColor: '#FF4D4D' },
  { id: 'ninja', name: { en: 'Ninja', fr: 'Ninja' }, rarity: 'epic', unlock: { type: 'gems', price: 90 }, body: '#1B1B1F', legs: '#1B1B1F', skin: '#F2C49B', accessory: 'headband', accColor: '#E53935' },
  { id: 'knight', name: { en: 'Sir Flush-a-lot', fr: 'Sire Chasse-d\'eau' }, rarity: 'epic', unlock: { type: 'chest' }, body: '#9EA7B3', legs: '#5F6B7A', skin: '#FFD7B5', accessory: 'helmet', accColor: '#9EA7B3' },
  { id: 'duck', name: { en: 'Rubber Ducky', fr: 'Canard en Plastique' }, rarity: 'epic', unlock: { type: 'chest' }, body: '#FFE135', legs: '#FFB300', skin: '#FFE135', accessory: 'duckbill', accColor: '#FF8F00' },
  { id: 'beanie', name: { en: 'Snow Buddy', fr: 'Copain des Neiges' }, rarity: 'rare', unlock: { type: 'chest' }, body: '#4FC3F7', legs: '#01579B', skin: '#FFD7B5', accessory: 'beanie', accColor: '#E53935' },
  { id: 'golden', name: { en: 'Golden Throne', fr: 'Trône d\'Or' }, rarity: 'legendary', unlock: { type: 'iap', productKey: 'starter' }, body: '#FFC107', legs: '#FF8F00', skin: '#FFE082', accessory: 'tophat', accColor: '#212121', glow: true },
];

export const DEFAULT_SKIN = 'rookie';
export const skinById = (id: string): SkinDef => SKINS.find((s) => s.id === id) ?? SKINS[0];
export const isSkinId = (id: unknown): id is string => typeof id === 'string' && SKINS.some((s) => s.id === id);

/** Skins that can drop from chests of a given tier. */
export function chestSkinPool(tier: 'basic' | 'epic'): SkinDef[] {
  return SKINS.filter((s) =>
    s.unlock.type === 'chest' || (tier === 'epic' && s.unlock.type === 'coins' && s.rarity === 'rare'),
  );
}

/** Rival "Queue Jumpers" look (always red so they read instantly as enemies). */
export const RIVAL_LOOK = { body: '#E5383B', legs: '#7A1C1E', skin: '#FFD7B5', accessory: 'beanie' as AccessoryId, accColor: '#2B2B2B' };
