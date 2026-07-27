import { describe, expect, it } from 'vitest';
import {
  awardActiveCardToCurrentPlayer,
  canSlidePyramid,
  computeWinnerIds,
  drawCardForCurrentPlayer,
  getAdjacentCellIds,
  nextPlayerIndex,
  scoreOf,
} from './rules';
import { buildTestState, updateCell } from './testHelpers';

describe('getAdjacentCellIds', () => {
  it('returns only up/down/left/right, no diagonals, clipped at the board edge', () => {
    const state = buildTestState();
    expect(getAdjacentCellIds(state.board, 'r0c0')).toEqual(['r1c0', 'r0c1']);
  });

  it('returns all four neighbors for an interior cell', () => {
    const state = buildTestState();
    expect(getAdjacentCellIds(state.board, 'r2c3')).toEqual(['r1c3', 'r3c3', 'r2c2', 'r2c4']);
  });
});

describe('canSlidePyramid', () => {
  it('allows a pyramid adjacent to the empty cell', () => {
    const state = buildTestState(); // empty at r0c0, r0c1 has a pyramid by default
    expect(canSlidePyramid(state, 'r0c1')).toBe(true);
  });

  it('refuses a non-adjacent pyramid', () => {
    const state = buildTestState();
    expect(canSlidePyramid(state, 'r5c7')).toBe(false);
  });

  it('refuses the empty cell itself (nothing to slide)', () => {
    const state = buildTestState();
    expect(canSlidePyramid(state, 'r0c0')).toBe(false);
  });

  it('refuses once the game has finished', () => {
    const state = buildTestState({ status: 'FINISHED' });
    expect(canSlidePyramid(state, 'r0c1')).toBe(false);
  });
});

describe('nextPlayerIndex', () => {
  it('cycles back to 0 after the last player', () => {
    const state = buildTestState({ currentPlayerIndex: 1 }); // 2 players in buildTestState
    expect(nextPlayerIndex(state)).toBe(0);
  });
});

describe('scoreOf / computeWinnerIds', () => {
  it('sums point values across won cards', () => {
    const player = { id: 'p1', name: 'A', wonCards: [{ id: 'c1', treasureId: 'x', points: 2 }, { id: 'c2', treasureId: 'y', points: 3 }] };
    expect(scoreOf(player)).toBe(5);
  });

  it('a single clear leader wins outright', () => {
    const players = [
      { id: 'p1', name: 'A', wonCards: [{ id: 'c1', treasureId: 'x', points: 4 }] },
      { id: 'p2', name: 'B', wonCards: [{ id: 'c2', treasureId: 'y', points: 1 }] },
    ];
    expect(computeWinnerIds(players)).toEqual(['p1']);
  });

  it('equal points, more cards wins', () => {
    const players = [
      { id: 'p1', name: 'A', wonCards: [{ id: 'c1', treasureId: 'x', points: 2 }, { id: 'c2', treasureId: 'y', points: 2 }] },
      { id: 'p2', name: 'B', wonCards: [{ id: 'c3', treasureId: 'z', points: 4 }] },
    ];
    expect(computeWinnerIds(players)).toEqual(['p1']);
  });

  it('equal points AND equal card count — both co-win', () => {
    const players = [
      { id: 'p1', name: 'A', wonCards: [{ id: 'c1', treasureId: 'x', points: 3 }] },
      { id: 'p2', name: 'B', wonCards: [{ id: 'c2', treasureId: 'y', points: 3 }] },
    ];
    expect(computeWinnerIds(players).sort()).toEqual(['p1', 'p2']);
  });
});

describe('awardActiveCardToCurrentPlayer', () => {
  it('adds the card to the current player, clears activeCard', () => {
    let state = buildTestState({ activeCard: { id: 'c1', treasureId: 'scarab', points: 3 }, drawPile: [{ id: 'c2', treasureId: 'ankh', points: 1 }] });
    state = awardActiveCardToCurrentPlayer(state);
    expect(state.players[0].wonCards).toEqual([{ id: 'c1', treasureId: 'scarab', points: 3 }]);
    expect(state.activeCard).toBeNull();
    expect(state.status).toBe('IN_PROGRESS');
  });

  it('finishes the game and computes winners when the draw pile is now empty', () => {
    let state = buildTestState({ activeCard: { id: 'c1', treasureId: 'scarab', points: 3 }, drawPile: [] });
    state = awardActiveCardToCurrentPlayer(state);
    expect(state.status).toBe('FINISHED');
    expect(state.winnerIds).toEqual(['player-1']);
  });
});

describe('drawCardForCurrentPlayer', () => {
  it('draws the top card into activeCard when it does not match what is already showing', () => {
    const state = buildTestState({ drawPile: [{ id: 'c1', treasureId: 'scarab', points: 2 }] });
    // empty cell (r0c0) has treasureId null by default — never matches a real treasureId
    const next = drawCardForCurrentPlayer(state);
    expect(next.activeCard).toEqual({ id: 'c1', treasureId: 'scarab', points: 2 });
    expect(next.drawPile).toEqual([]);
  });

  it('"lucky" case: auto-awards without a move when the new card matches what is already exposed', () => {
    let state = buildTestState({ drawPile: [{ id: 'c1', treasureId: 'ankh', points: 2 }, { id: 'c2', treasureId: 'scarab', points: 1 }] });
    state = updateCell(state, 'r0c0', { treasureId: 'ankh' }); // the currently-empty cell already shows "ankh"
    const next = drawCardForCurrentPlayer(state);
    // card c1 (ankh) matches immediately -> auto-won, then draws c2 next
    expect(next.players[0].wonCards).toEqual([{ id: 'c1', treasureId: 'ankh', points: 2 }]);
    expect(next.activeCard).toEqual({ id: 'c2', treasureId: 'scarab', points: 1 });
    expect(next.drawPile).toEqual([]);
  });
});
