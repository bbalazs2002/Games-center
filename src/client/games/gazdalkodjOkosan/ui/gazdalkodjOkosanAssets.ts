import { assetUrl } from '../../../core/assetUrl';
import type { FurnitureItemId } from '@shared/games/gazdalkodjOkosan/engine/state';

/**
 * Compressed, single-pawn model (Gazdálkodj okosan-0c) — see
 * docs/gazdalkodj-okosan-0c-vizual-specifikacio.md §1/§2. Pruned by
 * scripts/compress-gazdalkodj-okosan-glb.mjs from the raw, Blender-authored
 * full-board.glb down to just the ONE canonical pawn node (`figure-1-00`) —
 * every player's token reuses this same geometry, tinted per-player at
 * runtime (cloneWithTint), not six distinct shapes.
 */
export const GAZDALKODJ_PAWN_URL = assetUrl('/assets/gazdalkodj-okosan/pawn.glb');

/** The one surviving node's name inside pawn.glb — see KEEP_NODE_NAME in the compress script. */
export const GAZDALKODJ_PAWN_OBJECT_NAME = 'figure-1-00';

export const GAZDALKODJ_BOARD_TEXTURE_URL = assetUrl('/assets/gazdalkodj-okosan/board.jpg');

/** Real board's own aspect, confirmed from full-board.glb's board-plane POSITION accessor bounding box (X±2.5, Z±1.8). */
export const GAZDALKODJ_BOARD_WIDTH = 5;
export const GAZDALKODJ_BOARD_DEPTH = 3.6;

/** 6 distinct colors, one per player slot (2-6 players supported) — mirrors Hotel's PLAYER_COLORS/colorSwatch convention. */
export const GAZDALKODJ_PLAYER_COLORS = ['#e53e3e', '#3182ce', '#38a169', '#d69e2e', '#805ad5', '#dd6b20'];
export const GAZDALKODJ_PLAYER_COLOR_NAMES = ['piros', 'kék', 'zöld', 'sárga', 'lila', 'narancs'];

/** house/*.jpg product photos — see gazdalkodjOkosanHouseLayout.generated.ts for their extracted positions. */
export function gazdalkodjHouseImageUrl(imageName: string): string {
  return assetUrl(`/assets/gazdalkodj-okosan/house/${imageName}.jpg`);
}

/** FurnitureItemId -> the house/*.jpg image name that depicts it — confirmed against furnitureCatalog.ts's own brand labels/prices, see docs/gazdalkodj-okosan-0c-vizual-specifikacio.md §3. */
export const GAZDALKODJ_HOUSE_FURNITURE_IMAGE: Record<FurnitureItemId, string> = {
  konyhabutor: 'kitchen',
  szobabutor: 'livingroom',
  hutoszekreny: 'fridge',
  tuzhely: 'oven',
  mosogatogep: 'dishwasher',
  mosogep: 'washingMachine',
};

export const GAZDALKODJ_CAR_IMAGE = 'car';

export const GAZDALKODJ_CARD_FRONT_URL = assetUrl('/assets/gazdalkodj-okosan/card/front.jpg');
export const GAZDALKODJ_CARD_BACK_URL = assetUrl('/assets/gazdalkodj-okosan/card/back.jpg');

/** A small real banknote as a decorative flourish behind the cash figure — the number stays the actual data source, mirroring Hotel's own cashNoteFor (docs/hotel-0c-specifikacio.md §5.4). */
const CASH_NOTE_BREAKPOINTS: [number, string][] = [
  [5000, '5000'],
  [1000, '1000'],
  [100, '100'],
  [50, '50'],
  [0, '20'],
];

export function gazdalkodjCashNoteUrl(amount: number): string {
  const match = CASH_NOTE_BREAKPOINTS.find(([threshold]) => amount >= threshold);
  return assetUrl(`/assets/gazdalkodj-okosan/money/${match?.[1] ?? '20'}.jpg`);
}
