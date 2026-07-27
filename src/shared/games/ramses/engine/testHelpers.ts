import { BOARD_COLS, BOARD_ROWS } from './rules';
import type { RamsesCell, RamsesState } from './state';

/** A fully deterministic, blank (no treasures, no drawPile cards) 6x8 board with a single empty cell at r0c0 — tests set exactly the treasureId/hasPyramid/drawPile/activeCard values they need via overrides, instead of fighting createInitialState's randomness. */
export function buildTestState(overrides: Partial<RamsesState> = {}): RamsesState {
  const board: RamsesCell[] = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      board.push({ id: `r${row}c${col}`, row, col, treasureId: null, hasPyramid: true });
    }
  }
  board[0] = { ...board[0], hasPyramid: false };

  return {
    board,
    emptyCellId: 'r0c0',
    drawPile: [],
    activeCard: null,
    players: [
      { id: 'player-1', name: 'Alice', wonCards: [] },
      { id: 'player-2', name: 'Bob', wonCards: [] },
    ],
    currentPlayerIndex: 0,
    status: 'IN_PROGRESS',
    winnerIds: [],
    ...overrides,
  };
}

export function updateCell(state: RamsesState, cellId: string, patch: Partial<RamsesCell>): RamsesState {
  return { ...state, board: state.board.map((cell) => (cell.id === cellId ? { ...cell, ...patch } : cell)) };
}
