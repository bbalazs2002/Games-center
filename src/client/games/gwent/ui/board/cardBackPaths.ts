import { assetUrl } from '../../../../core/assetUrl';
import type { Faction } from '@shared/games/gwent/engine/types';

/**
 * Fixed output paths from `scripts/build-gwent-assets.mjs`'s `processCardBacks()`
 * (Gwent-0c) — hand-written, not generated, because the mapping depends on the
 * build script's own output naming convention, not on the researched card-data
 * JSON (unlike cardDefs.ts/leaderDefs.ts) — same reasoning as specialCardIds.ts.
 */
export const CARD_BACK_PATHS: Record<Faction, string> = {
  NorthernRealms: assetUrl('/assets/gwent/cards/backs/northern-realms.jpg'),
  Nilfgaard: assetUrl('/assets/gwent/cards/backs/nilfgaard.jpg'),
  Monsters: assetUrl('/assets/gwent/cards/backs/monsters.jpg'),
  Scoiatael: assetUrl('/assets/gwent/cards/backs/scoiatael.jpg'),
};

/** Used wherever no specific player/faction context is available (e.g. a hidden opponent-hand card whose faction isn't relevant to show). */
export const DEFAULT_CARD_BACK_PATH = assetUrl('/assets/gwent/cards/backs/default.jpg');
