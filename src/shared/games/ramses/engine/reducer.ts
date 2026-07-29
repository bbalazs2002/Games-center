import type { RamsesAction } from './actions';
import { awardActiveCardToCurrentPlayer, canSlidePyramid, drawCardForCurrentPlayer, nextPlayerIndex } from './rules';
import type { RamsesLogEntry, RamsesState } from './state';

function moveEmptyCellTo(state: RamsesState, fromCellId: string): RamsesState {
  const board = state.board.map((cell) => {
    if (cell.id === fromCellId) return { ...cell, hasPyramid: false };
    if (cell.id === state.emptyCellId) return { ...cell, hasPyramid: true };
    return cell;
  });
  return { ...state, board, emptyCellId: fromCellId };
}

/**
 * One entry per applySlidePyramid CALL, i.e. per real SLIDE_PYRAMID action —
 * NOT per lucky-draw auto-match cascade inside drawCardForCurrentPlayer,
 * which is automatic bookkeeping within the same action's resolution, not a
 * separate player decision (see docs/shell-ux-specifikacio.md §4.2.1).
 */
function logEntryFor(state: RamsesState, fromCellId: string, treasureRevealed: string | null, matched: boolean, pointsAwarded: number): RamsesLogEntry {
  return {
    playerId: state.players[state.currentPlayerIndex].id,
    fromCellId,
    toCellId: state.emptyCellId,
    treasureRevealed,
    matched,
    pointsAwarded,
  };
}

function applySlidePyramid(state: RamsesState, fromCellId: string): RamsesState {
  if (!canSlidePyramid(state, fromCellId)) return state;

  const next = moveEmptyCellTo(state, fromCellId);
  const revealedCell = next.board.find((c) => c.id === next.emptyCellId)!;

  if (revealedCell.treasureId === null) {
    const entry = logEntryFor(state, fromCellId, null, false, 0);
    return { ...next, log: [...next.log, entry] }; // blank — turn continues, same player, same activeCard
  }

  // Invariant: activeCard is always set while status is IN_PROGRESS (see state.ts).
  if (revealedCell.treasureId === next.activeCard!.treasureId) {
    const entry = logEntryFor(state, fromCellId, revealedCell.treasureId, true, next.activeCard!.points);
    const withLog = { ...next, log: [...next.log, entry] };
    const awarded = awardActiveCardToCurrentPlayer(withLog);
    return awarded.status === 'FINISHED' ? awarded : drawCardForCurrentPlayer(awarded);
  }

  // Wrong treasure — only this ends the current player's turn.
  const entry = logEntryFor(state, fromCellId, revealedCell.treasureId, false, 0);
  return { ...next, currentPlayerIndex: nextPlayerIndex(next), log: [...next.log, entry] };
}

export function reducer(state: RamsesState, action: RamsesAction): RamsesState {
  if (state.status !== 'IN_PROGRESS') return state;
  return applySlidePyramid(state, action.fromCellId);
}
