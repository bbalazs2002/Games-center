import { getAdjacentCellIds, getHiddenTreasureIds, scoreOf } from './rules';
import type { PendingSpecialEffect, Player, RamsesState, TreasureCard } from './state';

export function getCurrentPlayer(state: RamsesState): Player {
  return state.players[state.currentPlayerIndex];
}

/** turnPhases where SLIDE_PYRAMID is legal — mirrors rules.ts's canSlidePyramid gate, kept here too so callers (AI, UI) can tell up front whether sliding is even on the table right now, without probing individual cells. */
const SLIDE_PHASES: readonly RamsesState['turnPhase'][] = [
  'SEARCHING',
  'AWAITING_GIFT_SLIDE',
  'AWAITING_RISK_SLIDE',
  'AWAITING_POKER_SLIDE',
  'AWAITING_FATA_MORGANA_SLIDE',
];

/** Cell ids the current player could legally slide right now — empty once the game is over, or while a special card's naming step (Ajándék/Kockázat/Sivatagi póker) is pending. */
export function getSlidableCellIds(state: RamsesState): string[] {
  if (state.status !== 'IN_PROGRESS' || !SLIDE_PHASES.includes(state.turnPhase)) return [];
  return getAdjacentCellIds(state.board, state.emptyCellId).filter(
    (id) => state.board.find((c) => c.id === id)!.hasPyramid,
  );
}

/** Still-hidden treasureIds, valid targets for NAME_GIFT_TARGET/NAME_RISK_TREASURES/NAME_POKER_CHALLENGE — see rules.ts. Re-exported here so client/AI code only ever needs to import from selectors.ts, matching the rest of this module's role. */
export { getHiddenTreasureIds };

/**
 * The treasureId every SLIDE_PYRAMID is currently aiming for, whether that's
 * the normal `activeCard` or a special card's own in-progress target (see
 * docs/ramses-0a-specifikacio.md §8.2) — the single source of truth reducer.ts,
 * the AI, and any "what am I looking for?" UI all read from, so none of them
 * duplicate this per-phase branching themselves.
 */
export function getCurrentSearchTarget(state: RamsesState): string | null {
  switch (state.turnPhase) {
    case 'SEARCHING':
      return state.activeCard?.treasureId ?? null;
    case 'AWAITING_GIFT_SLIDE':
      return (state.pendingSpecialEffect as Extract<PendingSpecialEffect, { type: 'GIFT' }>).targetTreasureId;
    case 'AWAITING_RISK_SLIDE': {
      const effect = state.pendingSpecialEffect as Extract<PendingSpecialEffect, { type: 'RISK' }>;
      return effect.firstFound ? effect.treasureIds[1] : effect.treasureIds[0];
    }
    case 'AWAITING_POKER_SLIDE':
      return (state.pendingSpecialEffect as Extract<PendingSpecialEffect, { type: 'POKER' }>).treasureId;
    case 'AWAITING_FATA_MORGANA_SLIDE':
      return (state.pendingSpecialEffect as Extract<PendingSpecialEffect, { type: 'FATA_MORGANA' }>).card.treasureId;
    default:
      return null;
  }
}

/**
 * The real, physical card object (with a concrete `points` value, hence a
 * real image via treasureConfigs.ts's `cardImagePath`) currently at stake —
 * `state.activeCard` in the normal SEARCHING flow, or Fata Morgana's
 * blind-borrowed card during its own slide phase. Ajándék/Kockázat/Sivatagi
 * póker's targets are freely NAMED treasureIds, never tied to one specific
 * drawn card, so they have no real card image to show — null there (UI falls
 * back to the plain treasure icon, see docs/ramses-0a-specifikacio.md §8.2).
 */
export function getCurrentActiveCard(state: RamsesState): TreasureCard | null {
  if (state.turnPhase === 'SEARCHING') return state.activeCard;
  if (state.turnPhase === 'AWAITING_FATA_MORGANA_SLIDE') {
    return (state.pendingSpecialEffect as Extract<PendingSpecialEffect, { type: 'FATA_MORGANA' }>).card;
  }
  return null;
}

export interface PlayerScore {
  player: Player;
  score: number;
}

/** Highest score first — a natural scoreboard ordering for the UI. */
export function getScoreboard(state: RamsesState): PlayerScore[] {
  return state.players.map((player) => ({ player, score: scoreOf(player) })).sort((a, b) => b.score - a.score);
}

/** Only meaningful once the game is FINISHED — see rules.ts's computeWinnerIds (can be more than one, a genuine tie). */
export function getWinners(state: RamsesState): Player[] {
  return state.players.filter((player) => state.winnerIds.includes(player.id));
}

/** How many cards are left to draw — safe to show online too, since a masked state's drawPile is length-matched placeholders (see rules.ts's toPublicRamsesState), never real card contents. */
export function getDrawPileCount(state: RamsesState): number {
  return state.drawPile.length;
}
