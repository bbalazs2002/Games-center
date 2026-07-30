import type { PlayerId } from './state';

/**
 * `SLIDE_PYRAMID` is the one action used for every actual board move — the
 * normal search, and each special card's own slide-chain (Ajándék/Kockázat/
 * Sivatagi póker/Fata Morgana), which target differs based on `turnPhase`,
 * not on the action shape (see docs/ramses-0a-specifikacio.md §8.2). The 3
 * NAME_* actions are the only OTHER player-invoked decisions the special
 * cards need — card-flipping/turn-passing/special-card resolution otherwise
 * stays the reducer's own automatic bookkeeping (§2.3).
 */
export type RamsesAction =
  | { type: 'SLIDE_PYRAMID'; fromCellId: string }
  | { type: 'NAME_GIFT_TARGET'; treasureId: string }
  | { type: 'NAME_RISK_TREASURES'; treasureIds: [string, string] }
  | { type: 'NAME_POKER_CHALLENGE'; treasureId: string; targetPlayerId: PlayerId }
  | { type: 'FORFEIT' };
