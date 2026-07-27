import { describe, expect, it } from 'vitest';
import { reducer } from './reducer';
import { buildTestState, updateCell } from './testHelpers';

describe('reducer — SLIDE_PYRAMID', () => {
  it('is a no-op for a non-adjacent cell', () => {
    const state = buildTestState();
    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r5c7' });
    expect(next).toBe(state);
  });

  it('is a no-op once the game has finished', () => {
    const state = buildTestState({ status: 'FINISHED' });
    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c1' });
    expect(next).toBe(state);
  });

  it('revealing a blank cell moves the empty space and continues the same turn', () => {
    const state = buildTestState({ activeCard: { id: 'c1', treasureId: 'scarab', points: 3 } });
    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c1' });

    expect(next.emptyCellId).toBe('r0c1');
    expect(next.board.find((c) => c.id === 'r0c0')?.hasPyramid).toBe(true);
    expect(next.board.find((c) => c.id === 'r0c1')?.hasPyramid).toBe(false);
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.activeCard).toEqual({ id: 'c1', treasureId: 'scarab', points: 3 });
  });

  it('revealing the wrong treasure passes the turn — activeCard stays the same target', () => {
    let state = buildTestState({ activeCard: { id: 'c1', treasureId: 'scarab', points: 3 } });
    state = updateCell(state, 'r0c1', { treasureId: 'ankh' });

    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c1' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.activeCard).toEqual({ id: 'c1', treasureId: 'scarab', points: 3 });
    expect(next.players[0].wonCards).toEqual([]);
  });

  it('revealing the right treasure awards the card, the SAME player continues, and draws the next card', () => {
    let state = buildTestState({
      activeCard: { id: 'c1', treasureId: 'scarab', points: 3 },
      drawPile: [{ id: 'c2', treasureId: 'ankh', points: 1 }],
    });
    state = updateCell(state, 'r0c1', { treasureId: 'scarab' });

    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c1' });
    expect(next.currentPlayerIndex).toBe(0); // NOT the next player — house rule, see docs/ramses-0a-specifikacio.md §2.3
    expect(next.players[0].wonCards).toEqual([{ id: 'c1', treasureId: 'scarab', points: 3 }]);
    expect(next.activeCard).toEqual({ id: 'c2', treasureId: 'ankh', points: 1 });
    expect(next.drawPile).toEqual([]);
    expect(next.status).toBe('IN_PROGRESS');
  });

  it('winning the last card in the pile finishes the game and computes a winner', () => {
    let state = buildTestState({
      activeCard: { id: 'c1', treasureId: 'scarab', points: 3 },
      drawPile: [],
    });
    state = updateCell(state, 'r0c1', { treasureId: 'scarab' });

    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c1' });
    expect(next.status).toBe('FINISHED');
    expect(next.winnerIds).toEqual(['player-1']);
    expect(next.activeCard).toBeNull();
  });

  it('a chain of blanks lets the same player keep sliding indefinitely', () => {
    const state = buildTestState({ activeCard: { id: 'c1', treasureId: 'scarab', points: 3 } });
    // r0c0 (empty) -> slide r0c1 (blank) -> empty now r0c1 -> slide r0c2 (blank)
    const afterFirst = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c1' });
    const afterSecond = reducer(afterFirst, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c2' });

    expect(afterSecond.emptyCellId).toBe('r0c2');
    expect(afterSecond.currentPlayerIndex).toBe(0);
    expect(afterSecond.activeCard).toEqual({ id: 'c1', treasureId: 'scarab', points: 3 });
  });
});
