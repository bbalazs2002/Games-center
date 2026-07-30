/**
 * The 12 real treasures, confirmed against the physical assets
 * (`assets/Ramses/png/board/{id}.png`) — see docs/ramses-0a-specifikacio.md
 * §2.1/§8.1. `color` stays as a placeholder fallback (used while `imagePath`
 * isn't wired in yet, or if an image ever fails to load); `imagePath` points
 * at the resized, web-served copy under `public/assets/ramses/board/`,
 * produced by `scripts/resize-ramses-images.mjs`.
 */
export interface TreasureConfig {
  id: string;
  label: string;
  color: string;
  imagePath?: string;
}

export const TREASURE_CONFIGS: TreasureConfig[] = [
  { id: 'bird', label: 'Madár', color: '#2a9d8f', imagePath: '/assets/ramses/board/bird.png' },
  { id: 'candlestick', label: 'Gyertyatartó', color: '#c9a227', imagePath: '/assets/ramses/board/candlestick.png' },
  { id: 'computer', label: 'Számítógép', color: '#264653', imagePath: '/assets/ramses/board/computer.png' },
  { id: 'dog', label: 'Kutya', color: '#a98467', imagePath: '/assets/ramses/board/dog.png' },
  { id: 'duck', label: 'Kacsa', color: '#e9c46a', imagePath: '/assets/ramses/board/duck.png' },
  { id: 'glasses', label: 'Szemüveg', color: '#6a4c93', imagePath: '/assets/ramses/board/glasses.png' },
  { id: 'hippopotamus', label: 'Víziló', color: '#588157', imagePath: '/assets/ramses/board/hippopotamus.png' },
  { id: 'mummy', label: 'Múmia', color: '#9e2a2b', imagePath: '/assets/ramses/board/mummy.png' },
  { id: 'prosthesis', label: 'Protézis', color: '#bc6c25', imagePath: '/assets/ramses/board/prosthesis.png' },
  { id: 'sphinx', label: 'Szfinx', color: '#3a5a40', imagePath: '/assets/ramses/board/sphinx.png' },
  { id: 'stroller', label: 'Babakocsi', color: '#ffb703', imagePath: '/assets/ramses/board/stroller.png' },
  { id: 'trumpet', label: 'Trombita', color: '#8338ec', imagePath: '/assets/ramses/board/trumpet.png' },
];

export function getTreasureConfig(treasureId: string): TreasureConfig {
  const config = TREASURE_CONFIGS.find((t) => t.id === treasureId);
  if (!config) throw new Error(`Unknown treasure: ${treasureId}`);
  return config;
}

/**
 * The real, resized photo (see docs/ramses-0a-specifikacio.md §8.1) of the
 * EXACT card a player drew/holds — different from `getTreasureConfig`'s
 * `imagePath`, which is the board-layer icon, not a picture of the physical
 * card itself. `points` determines the pack (1-2 pont -> pakli 1, 3 pont ->
 * pakli 2, 4 pont -> pakli 3), matching the real filename convention
 * `{treasureId}-b{pakli}-f{pont}.jpg` — except pakli 3's `candlestick`, whose
 * file is named `candlebar` (confirmed no typo, see §8.1's elnevezési
 * following note).
 */
export function cardImagePath(treasureId: string, points: number): string {
  const pack = points === 4 ? 3 : points === 3 ? 2 : 1;
  const fileTreasureId = pack === 3 && treasureId === 'candlestick' ? 'candlebar' : treasureId;
  return `/assets/ramses/cards/${pack}/${fileTreasureId}-b${pack}-f${points}.jpg`;
}
