import type { RamsesAction } from './actions';
import { awardActiveCardToCurrentPlayer, canSlidePyramid, drawCardForCurrentPlayer, nextPlayerIndex } from './rules';
import type { RamsesState } from './state';

function moveEmptyCellTo(state: RamsesState, fromCellId: string): RamsesState {
  const board = state.board.map((cell) => {
    if (cell.id === fromCellId) return { ...cell, hasPyramid: false };
    if (cell.id === state.emptyCellId) return { ...cell, hasPyramid: true };
    return cell;
  });
  return { ...state, board, emptyCellId: fromCellId };
}

function applySlidePyramid(state: RamsesState, fromCellId: string): RamsesState {
  if (!canSlidePyramid(state, fromCellId)) return state;

  const next = moveEmptyCellTo(state, fromCellId);
  const revealedCell = next.board.find((c) => c.id === next.emptyCellId)!;

  if (revealedCell.treasureId === null) {
    return next; // blank — turn continues, same player, same activeCard
  }

  // Invariant: activeCard is always set while status is IN_PROGRESS (see state.ts).
  if (revealedCell.treasureId === next.activeCard!.treasureId) {
    const awarded = awardActiveCardToCurrentPlayer(next);
    return awarded.status === 'FINISHED' ? awarded : drawCardForCurrentPlayer(awarded);
  }

  // Wrong treasure — only this ends the current player's turn.
  return { ...next, currentPlayerIndex: nextPlayerIndex(next) };
}

export function reducer(state: RamsesState, action: RamsesAction): RamsesState {
  if (state.status !== 'IN_PROGRESS') return state;
  return applySlidePyramid(state, action.fromCellId);
}
