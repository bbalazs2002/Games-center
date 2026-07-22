import type { DamaState, Player, Position } from './state';
import { findCaptureMoves, findSimpleMoves, getPieceAt, hasAnyCapture, isSamePosition } from './rules';

/** Reachable target squares for the given piece of the current player, honoring the mandatory-capture rule. */
export function getValidMoves(state: DamaState, from: Position): Position[] {
  const piece = getPieceAt(state.board, from);
  if (!piece || piece.player !== state.currentPlayer) return [];
  if (state.chainCaptureFrom && !isSamePosition(state.chainCaptureFrom, from)) return [];

  const captureTargets = findCaptureMoves(state, from).map((move) => move.to);
  if (captureTargets.length > 0) return captureTargets;
  if (hasAnyCapture(state, state.currentPlayer)) return [];

  return findSimpleMoves(state, from);
}

export function getWinner(state: DamaState): Player | null {
  if (state.status === 'LIGHT_WON') return 'LIGHT';
  if (state.status === 'DARK_WON') return 'DARK';
  return null;
}

/** Squares of the current player's actually-movable pieces — worth highlighting in the UI at the start of a turn. */
export function getMovablePositions(state: DamaState): Position[] {
  const positions: Position[] = [];
  state.board.forEach((row, rowIndex) => {
    row.forEach((piece, colIndex) => {
      if (piece?.player !== state.currentPlayer) return;
      const position = { row: rowIndex, col: colIndex };
      if (getValidMoves(state, position).length > 0) positions.push(position);
    });
  });
  return positions;
}
