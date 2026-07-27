/**
 * Deliberately the ONLY action type — card-flipping and turn-passing are the
 * reducer's own automatic bookkeeping, not player-invoked steps (see
 * docs/ramses-0a-specifikacio.md §2.3).
 */
export type RamsesAction = { type: 'SLIDE_PYRAMID'; fromCellId: string };
