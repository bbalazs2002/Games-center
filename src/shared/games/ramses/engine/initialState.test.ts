import { describe, expect, it } from 'vitest';
import { createInitialState } from './initialState';
import { BOARD_COLS, BOARD_ROWS } from './rules';
import { TREASURE_CONFIGS } from './treasureConfigs';

describe('createInitialState', () => {
  it('builds a 48-cell board with exactly 12 distinct treasures and 36 blanks', () => {
    const state = createInitialState(['Alice', 'Bob']);
    expect(state.board).toHaveLength(48);

    const treasureIds = state.board.map((cell) => cell.treasureId).filter((id): id is string => id !== null);
    expect(treasureIds).toHaveLength(12);
    expect(new Set(treasureIds).size).toBe(12);
    expect(new Set(treasureIds)).toEqual(new Set(TREASURE_CONFIGS.map((t) => t.id)));

    const blanks = state.board.filter((cell) => cell.treasureId === null);
    expect(blanks).toHaveLength(36);
  });

  it('places exactly one treasure per 2x2 sub-grid, top-left-aligned', () => {
    const state = createInitialState(['Alice', 'Bob']);
    const subgridRows = BOARD_ROWS / 2;
    const subgridCols = BOARD_COLS / 2;

    for (let subgridRow = 0; subgridRow < subgridRows; subgridRow += 1) {
      for (let subgridCol = 0; subgridCol < subgridCols; subgridCol += 1) {
        const cellsInSubgrid = state.board.filter(
          (cell) =>
            Math.floor(cell.row / 2) === subgridRow && Math.floor(cell.col / 2) === subgridCol,
        );
        expect(cellsInSubgrid).toHaveLength(4);
        const treasuresInSubgrid = cellsInSubgrid.filter((cell) => cell.treasureId !== null);
        expect(treasuresInSubgrid).toHaveLength(1);
      }
    }
  });

  it('leaves exactly one cell without a pyramid, and it is a blank one', () => {
    const state = createInitialState(['Alice', 'Bob']);
    const withoutPyramid = state.board.filter((cell) => !cell.hasPyramid);
    expect(withoutPyramid).toHaveLength(1);
    expect(withoutPyramid[0].id).toBe(state.emptyCellId);
    expect(withoutPyramid[0].treasureId).toBeNull();
  });

  it('sets up players from the given names, draws exactly one card (the initial empty cell can never "luckily" match), and starts in progress', () => {
    const state = createInitialState(['Alice', 'Bob', 'Carol']);
    expect(state.players.map((p) => p.name)).toEqual(['Alice', 'Bob', 'Carol']);
    expect(state.players.every((p) => p.wonCards.length === 0)).toBe(true);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.status).toBe('IN_PROGRESS');
    expect(state.activeCard).not.toBeNull();
    expect(state.turnPhase).toBe('SEARCHING');
    expect(state.pendingSpecialEffect).toBeNull();
    expect(state.treasureLayerRotated).toBe(false);
    // 48-card real deck (20+19+9, see §2.1/§8.1), minus the one card the
    // first draw always takes — always from pack 1 (all-treasure), so
    // activeCard is guaranteed a TreasureCard, never a SpecialCard.
    expect(state.drawPile).toHaveLength(47);
  });

  it('includes all 12 special cards by default (11 in pack 2 + Záró in pack 3), none of them ever becoming activeCard', () => {
    const state = createInitialState(['Alice', 'Bob']);
    const specialCount = state.drawPile.filter((card) => card.kind === 'special').length;
    expect(specialCount).toBe(12);
    expect(state.activeCard?.kind).toBe('treasure');
  });

  it('includeSpecialCards: false yields the original 36-card, special-card-free deck', () => {
    const state = createInitialState(['Alice', 'Bob'], { includeSpecialCards: false });
    expect(state.drawPile.every((card) => card.kind === 'treasure')).toBe(true);
    expect(state.drawPile).toHaveLength(35); // 20+8+8, minus the one already drawn
  });
});
