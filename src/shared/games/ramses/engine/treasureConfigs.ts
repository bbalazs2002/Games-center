/**
 * The 12 treasures — placeholder content until the real card/board contents
 * are known (see docs/ramses-0a-specifikacio.md §5.1). `color` is the
 * placeholder visual; `imagePath` is left undefined for now, but the field
 * exists so a later round can drop in real images without touching any
 * rendering code — the renderer already reads `imagePath` when present,
 * falling back to `color`.
 */
export interface TreasureConfig {
  id: string;
  label: string;
  color: string;
  imagePath?: string;
}

export const TREASURE_CONFIGS: TreasureConfig[] = [
  { id: 'scarab', label: 'Skarabeusz', color: '#c9a227' },
  { id: 'ankh', label: 'Ankh', color: '#2a9d8f' },
  { id: 'eye-of-horus', label: 'Hórusz szeme', color: '#264653' },
  { id: 'pharaoh-mask', label: 'Fáraó maszkja', color: '#e9c46a' },
  { id: 'papyrus', label: 'Papirusz', color: '#a98467' },
  { id: 'obelisk', label: 'Obeliszk', color: '#6a4c93' },
  { id: 'sphinx', label: 'Szfinx', color: '#bc6c25' },
  { id: 'lotus', label: 'Lótusz', color: '#588157' },
  { id: 'cobra', label: 'Kobra', color: '#3a5a40' },
  { id: 'canopic-jar', label: 'Kanópusz-edény', color: '#9e2a2b' },
  { id: 'gold-coin', label: 'Aranyérme', color: '#ffb703' },
  { id: 'amulet', label: 'Amulett', color: '#8338ec' },
];

export function getTreasureConfig(treasureId: string): TreasureConfig {
  const config = TREASURE_CONFIGS.find((t) => t.id === treasureId);
  if (!config) throw new Error(`Unknown treasure: ${treasureId}`);
  return config;
}
