import type { Board, DamaState, Piece, Player } from './state';

const BOARD_SIZE = 8;

function isDarkSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

function startingPlayerForRow(row: number): Player | null {
  if (row <= 2) return 'DARK';
  if (row >= BOARD_SIZE - 3) return 'LIGHT';
  return null;
}

function createInitialBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from({ length: BOARD_SIZE }, (_, col): Piece | null => {
      if (!isDarkSquare(row, col)) return null;
      const player = startingPlayerForRow(row);
      return player ? { player, type: 'MAN' } : null;
    }),
  );
}

/** Convention: LIGHT goes first, like White in chess — see docs/dama-0a-specifikacio.md. */
export function createInitialState(): DamaState {
  return {
    board: createInitialBoard(),
    currentPlayer: 'LIGHT',
    status: 'IN_PROGRESS',
    chainCaptureFrom: null,
  };
}
