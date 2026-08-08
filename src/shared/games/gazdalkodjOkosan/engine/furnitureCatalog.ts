import type { FurnitureItemId } from './state';

/**
 * Bútor-árlista — docs/gazdalkodj-okosan-0a-specifikacio.md §2.3, a
 * felhasználó saját, a fizikai játékból lediktált pontosítása (2026-08-08).
 * Adatvezérelt, nem kódba égetett, hogy egy jövőbeli korrekció ne igényeljen
 * reducer-változtatást.
 */
export const FURNITURE_CATALOG: Record<FurnitureItemId, { label: string; price: number }> = {
  konyhabutor: { label: 'Konyhabútor (HANÁK)', price: 1000 },
  mosogep: { label: 'Mosógép (Electrolux)', price: 300 },
  hutoszekreny: { label: 'Hűtőszekrény (Electrolux)', price: 200 },
  mosogatogep: { label: 'Mosogatógép (Electrolux)', price: 300 },
  tuzhely: { label: 'Tűzhely (Electrolux)', price: 200 },
  szobabutor: { label: 'Szobabútor', price: 3000 },
};

export const ALL_FURNITURE_ITEMS: FurnitureItemId[] = Object.keys(FURNITURE_CATALOG) as FurnitureItemId[];
