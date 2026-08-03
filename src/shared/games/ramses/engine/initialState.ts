import { drawCardForCurrentPlayer } from './reducer';
import { BOARD_COLS, BOARD_ROWS } from './rules';
import type { DrawnCard, Player, RamsesCell, RamsesState, SpecialCard, SpecialCardType, TreasureCard } from './state';
import { TREASURE_CONFIGS } from './treasureConfigs';
import { shuffle } from '../../../core/shuffle';

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

function treasureCard(id: string, treasureId: string, points: number): TreasureCard {
  return { kind: 'treasure', id, treasureId, points };
}

/** 20 cards, all plain (see docs/ramses-0a-specifikacio.md §2.1/§8.1) — the exact treasure/point-value composition confirmed against the real card assets' filenames. */
function pack1Cards(): TreasureCard[] {
  const entries: Array<[string, number]> = [
    ['bird', 1],
    ['bird', 2],
    ['candlestick', 1],
    ['candlestick', 2],
    ['computer', 1],
    ['computer', 2],
    ['dog', 1],
    ['dog', 2],
    ['duck', 1],
    ['glasses', 1],
    ['hippopotamus', 1],
    ['hippopotamus', 2],
    ['mummy', 1],
    ['mummy', 2],
    ['prosthesis', 1],
    ['sphinx', 1],
    ['stroller', 1],
    ['stroller', 2],
    ['trumpet', 1],
    ['trumpet', 2],
  ];
  return entries.map(([treasureId, points], i) => treasureCard(`p1-${i}`, treasureId, points));
}

/** 8 cards, all worth 3 points (see §2.1/§8.1). */
function pack2TreasureCards(): TreasureCard[] {
  const treasureIds = ['candlestick', 'computer', 'duck', 'glasses', 'mummy', 'prosthesis', 'sphinx', 'trumpet'];
  return treasureIds.map((treasureId, i) => treasureCard(`p2-${i}`, treasureId, 3));
}

/** 11 special cards, 5 types (see §2.1/§2.5/§8.1 — counts confirmed against the real `special-*-Nx.png` filenames). */
function pack2SpecialCards(): SpecialCard[] {
  const counts: Array<[SpecialCardType, number]> = [
    ['SANDSTORM', 2],
    ['GIFT', 2],
    ['RISK', 2],
    ['POKER', 2],
    ['FATA_MORGANA', 3],
  ];
  const cards: SpecialCard[] = [];
  let i = 0;
  for (const [specialType, count] of counts) {
    for (let n = 0; n < count; n += 1) {
      cards.push({ kind: 'special', id: `p2-special-${i}`, specialType });
      i += 1;
    }
  }
  return cards;
}

/** 8 cards, all worth 4 points (see §2.1/§8.1 — the `candlebar-b3-f4.png` file maps to the `candlestick` treasureId, confirmed no typo). */
function pack3TreasureCards(): TreasureCard[] {
  const treasureIds = ['candlestick', 'computer', 'dog', 'hippopotamus', 'mummy', 'prosthesis', 'stroller', 'trumpet'];
  return treasureIds.map((treasureId, i) => treasureCard(`p3-${i}`, treasureId, 4));
}

/**
 * 3 separate sub-piles, each shuffled on its own, drawn strictly 1 -> 2 -> 3,
 * never interleaved (see docs/ramses-0a-specifikacio.md §2.1/§2.2). With
 * `includeSpecialCards: false`, packs 2/3 drop their special cards entirely
 * (including Záró, itself a special card) and the game behaves exactly like
 * the original special-card-free engine (§8.3).
 */
function createDeck(includeSpecialCards: boolean): DrawnCard[] {
  const pack1 = shuffle(pack1Cards());
  const pack2: DrawnCard[] = includeSpecialCards
    ? shuffle([...pack2TreasureCards(), ...pack2SpecialCards()])
    : shuffle(pack2TreasureCards());
  const finishCard: SpecialCard = { kind: 'special', id: 'p3-finish', specialType: 'FINISH' };
  const pack3: DrawnCard[] = includeSpecialCards
    ? shuffle([...pack3TreasureCards(), finishCard])
    : shuffle(pack3TreasureCards());
  return [...pack1, ...pack2, ...pack3];
}

export interface CreateInitialStateOptions {
  /** Defaults to true — see docs/ramses-0a-specifikacio.md §8.3. */
  includeSpecialCards?: boolean;
}

export function createInitialState(playerNames: string[], options: CreateInitialStateOptions = {}): RamsesState {
  const board = createBoard();
  const emptyCellId = pickInitialEmptyCellId(board);
  const readyBoard = board.map((cell) => (cell.id === emptyCellId ? { ...cell, hasPyramid: false } : cell));

  const players: Player[] = playerNames.map((name, index) => ({
    id: `player-${index + 1}`,
    name,
    wonCards: [],
    forfeited: false,
  }));

  const withoutFirstCard: RamsesState = {
    board: readyBoard,
    emptyCellId,
    drawPile: createDeck(options.includeSpecialCards ?? true),
    activeCard: null,
    turnPhase: 'SEARCHING',
    pendingSpecialEffect: null,
    treasureLayerRotated: false,
    players,
    currentPlayerIndex: 0,
    status: 'IN_PROGRESS',
    winnerIds: [],
    log: [],
  };

  // Draws the first card for player-1 — reuses the exact same "draw + resolve
  // a lucky match / a special card" logic a normal in-game draw uses
  // (reducer.ts), rather than duplicating it here. The initial empty cell is
  // guaranteed blank (see pickInitialEmptyCellId), so this can never
  // immediately chain into a win.
  return drawCardForCurrentPlayer(withoutFirstCard);
}
