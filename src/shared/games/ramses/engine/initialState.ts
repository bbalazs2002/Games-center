import { BOARD_COLS, BOARD_ROWS, drawCardForCurrentPlayer } from './rules';
import type { Player, RamsesCell, RamsesState, SearchCard } from './state';
import { TREASURE_CONFIGS } from './treasureConfigs';

/** 30 cards — placeholder distribution until the real physical deck is known (see docs/ramses-0a-specifikacio.md §5.1/§6): each of the 12 treasures repeated a roughly even number of times, point values 1-4 cycled for a rough balance. */
const CARD_COUNT = 30;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const SUBGRID_SIZE = 2;

/**
 * Treasure placement rule confirmed by the user 2026-07-27 (not in the
 * original rulebook text captured in the spec): the board is divided,
 * top-left-aligned, into 2x2 sub-grids — for a 6x8 board that's 3x4 = 12
 * sub-grids, exactly matching the 12 treasures. Each sub-grid gets exactly
 * one treasure at a random position within it (the other 3 cells blank),
 * and which treasure lands in which sub-grid is also randomized. This keeps
 * treasures spread out spatially instead of a pure global shuffle, which
 * could otherwise cluster several of them in one corner.
 */
function createBoard(): RamsesCell[] {
  const subgridRows = BOARD_ROWS / SUBGRID_SIZE;
  const subgridCols = BOARD_COLS / SUBGRID_SIZE;
  const shuffledTreasureIds = shuffle(TREASURE_CONFIGS.map((t) => t.id));

  const treasureIdByCellIndex = new Map<number, string>();
  let subgridIndex = 0;
  for (let subgridRow = 0; subgridRow < subgridRows; subgridRow += 1) {
    for (let subgridCol = 0; subgridCol < subgridCols; subgridCol += 1) {
      const offset = Math.floor(Math.random() * SUBGRID_SIZE * SUBGRID_SIZE);
      const row = subgridRow * SUBGRID_SIZE + Math.floor(offset / SUBGRID_SIZE);
      const col = subgridCol * SUBGRID_SIZE + (offset % SUBGRID_SIZE);
      treasureIdByCellIndex.set(row * BOARD_COLS + col, shuffledTreasureIds[subgridIndex]);
      subgridIndex += 1;
    }
  }

  const board: RamsesCell[] = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const index = row * BOARD_COLS + col;
      board.push({
        id: `r${row}c${col}`,
        row,
        col,
        treasureId: treasureIdByCellIndex.get(index) ?? null,
        hasPyramid: true,
      });
    }
  }
  return board;
}

/** The starting empty space must not show a treasure (see docs/ramses-0a-specifikacio.md §2.2) — only a setup-time constraint, not an ongoing rule. */
function pickInitialEmptyCellId(board: RamsesCell[]): string {
  const blankCells = board.filter((cell) => cell.treasureId === null);
  return blankCells[Math.floor(Math.random() * blankCells.length)].id;
}

function createDeck(): SearchCard[] {
  const cards: SearchCard[] = [];
  for (let i = 0; i < CARD_COUNT; i += 1) {
    const treasure = TREASURE_CONFIGS[i % TREASURE_CONFIGS.length];
    const points = (i % 4) + 1;
    cards.push({ id: `card-${i}`, treasureId: treasure.id, points });
  }
  return shuffle(cards);
}

export function createInitialState(playerNames: string[]): RamsesState {
  const board = createBoard();
  const emptyCellId = pickInitialEmptyCellId(board);
  const readyBoard = board.map((cell) => (cell.id === emptyCellId ? { ...cell, hasPyramid: false } : cell));

  const players: Player[] = playerNames.map((name, index) => ({
    id: `player-${index + 1}`,
    name,
    wonCards: [],
  }));

  const withoutFirstCard: RamsesState = {
    board: readyBoard,
    emptyCellId,
    drawPile: createDeck(),
    activeCard: null,
    players,
    currentPlayerIndex: 0,
    status: 'IN_PROGRESS',
    winnerIds: [],
    log: [],
  };

  // Draws the first card for player-1 — reuses the exact same "draw + resolve
  // a lucky match" logic a normal in-game draw uses (rules.ts), rather than
  // duplicating it here. The initial empty cell is guaranteed blank (see
  // pickInitialEmptyCellId), so this can never immediately chain into a win.
  return drawCardForCurrentPlayer(withoutFirstCard);
}
