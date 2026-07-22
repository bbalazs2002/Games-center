import type { DamaState, Player, Position } from './state';
import { findCaptureMoves, findSimpleMoves, getPieceAt, hasAnyCapture, isSamePosition } from './rules';

/** A soron lévő játékos adott bábujának elérhető célmezői, kötelező ütés szabályát figyelembe véve. */
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

/** A soron lévő játékos ténylegesen léphető bábuinak mezői — kör elején ezt érdemes kiemelni a UI-n. */
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
