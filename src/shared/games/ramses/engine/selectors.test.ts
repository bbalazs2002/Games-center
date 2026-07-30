import { describe, expect, it } from 'vitest';
import { getCurrentPlayer, getDrawPileCount, getScoreboard, getSlidableCellIds, getWinners } from './selectors';
import { buildTestState, updateCell } from './testHelpers';

describe('getCurrentPlayer', () => {
  it('returns the player at currentPlayerIndex', () => {
    const state = buildTestState({ currentPlayerIndex: 1 });
    expect(getCurrentPlayer(state).id).toBe('player-2');
  });
});

describe('getSlidableCellIds', () => {
  it('lists only pyramid-covered neighbors of the empty cell', () => {
    let state = buildTestState(); // empty at r0c0; r1c0 and r0c1 both have pyramids by default
    state = updateCell(state, 'r0c1', { hasPyramid: false }); // pretend a second cell is also empty (won't happen in a real game, just isolating the filter)
    expect(getSlidableCellIds(state)).toEqual(['r1c0']);
  });

  it('is empty once the game has finished', () => {
    const state = buildTestState({ status: 'FINISHED' });
    expect(getSlidableCellIds(state)).toEqual([]);
  });
});

describe('getScoreboard / getWinners', () => {
  it('sorts highest score first', () => {
    const state = buildTestState({
      players: [
        { id: 'player-1', name: 'Alice', wonCards: [{ kind: 'treasure', id: 'c1', treasureId: 'x', points: 1 }] },
        { id: 'player-2', name: 'Bob', wonCards: [{ kind: 'treasure', id: 'c2', treasureId: 'y', points: 4 }] },
      ],
    });
    const scoreboard = getScoreboard(state);
    expect(scoreboard[0].player.id).toBe('player-2');
    expect(scoreboard[0].score).toBe(4);
    expect(scoreboard[1].score).toBe(1);
  });

  it('getWinners resolves winnerIds back to Player objects', () => {
    const state = buildTestState({ status: 'FINISHED', winnerIds: ['player-2'] });
    expect(getWinners(state).map((p) => p.id)).toEqual(['player-2']);
  });
});

describe('getDrawPileCount', () => {
  it('returns the number of cards left in the draw pile', () => {
    const state = buildTestState({
      drawPile: [
        { kind: 'treasure', id: 'c1', treasureId: 'x', points: 1 },
        { kind: 'treasure', id: 'c2', treasureId: 'y', points: 2 },
      ],
    });
    expect(getDrawPileCount(state)).toBe(2);
  });
});
