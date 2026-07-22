import type { Board, DamaState, Piece, Player, Position } from './state';

const BOARD_SIZE = 8;

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null));
}

export function withPieces(placements: Array<[Position, Piece]>): Board {
  const board = emptyBoard();
  for (const [position, piece] of placements) {
    board[position.row][position.col] = piece;
  }
  return board;
}

export function stateWith(overrides: Partial<DamaState> & { board: Board }): DamaState {
  return {
    currentPlayer: 'LIGHT',
    status: 'IN_PROGRESS',
    chainCaptureFrom: null,
    ...overrides,
  };
}

export function man(player: Player): Piece {
  return { player, type: 'MAN' };
}

export function king(player: Player): Piece {
  return { player, type: 'KING' };
}

export function pos(row: number, col: number): Position {
  return { row, col };
}
