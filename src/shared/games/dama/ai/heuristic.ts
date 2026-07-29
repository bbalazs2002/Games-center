import { findCaptureMoves, findSimpleMoves, hasAnyCapture, opponentOf } from '../engine/rules';
import type { Board, DamaState, Player } from '../engine/state';

const BOARD_SIZE = 8;
const MAN_VALUE = 1;
const KING_VALUE = 1.5;
const MOBILITY_WEIGHT = 0.1;
const ADVANCEMENT_WEIGHT = 0.05;

function materialAndAdvancement(board: Board, player: Player): { material: number; advancement: number } {
  let material = 0;
  let advancement = 0;
  board.forEach((row, rowIndex) => {
    row.forEach((piece) => {
      if (!piece || piece.player !== player) return;
      if (piece.type === 'KING') {
        material += KING_VALUE;
        return;
      }
      material += MAN_VALUE;
      // Rows already travelled toward the promotion row — see isPromotionRow in rules.ts (LIGHT promotes at row 0, DARK at row 7).
      advancement += player === 'LIGHT' ? BOARD_SIZE - 1 - rowIndex : rowIndex;
    });
  });
  return { material, advancement };
}

/**
 * Legal-move count for an arbitrary `player`, honoring the mandatory-capture
 * rule — unlike selectors.ts's getValidMoves/getMovablePositions, this isn't
 * tied to `state.currentPlayer`, since the search needs both sides' mobility
 * from the same state (see docs/dama-0d-ai-specifikacio.md §4).
 */
function countLegalMoves(state: DamaState, player: Player): number {
  const mustCapture = hasAnyCapture(state, player);
  let count = 0;
  state.board.forEach((row, rowIndex) => {
    row.forEach((piece, colIndex) => {
      if (piece?.player !== player) return;
      const from = { row: rowIndex, col: colIndex };
      const captureCount = findCaptureMoves(state, from).length;
      count += mustCapture ? captureCount : captureCount + findSimpleMoves(state, from).length;
    });
  });
  return count;
}

/**
 * Weighted score of `state` from `forPlayer`'s perspective — higher is
 * better for `forPlayer`. Initial weights, not playtested/tuned — see
 * docs/dama-0d-ai-specifikacio.md §4/§13 (finalized in the future Dáma-0d.2
 * simulation round, not here).
 */
export function evaluateDamaState(state: DamaState, forPlayer: Player): number {
  const opponent = opponentOf(forPlayer);
  const own = materialAndAdvancement(state.board, forPlayer);
  const opp = materialAndAdvancement(state.board, opponent);
  const mobility = countLegalMoves(state, forPlayer) - countLegalMoves(state, opponent);
  const advancement = own.advancement - opp.advancement;
  return own.material - opp.material + MOBILITY_WEIGHT * mobility + ADVANCEMENT_WEIGHT * advancement;
}
