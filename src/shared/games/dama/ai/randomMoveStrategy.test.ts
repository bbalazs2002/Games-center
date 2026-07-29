import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../../../shared/games/dama/engine/initialState';
import { getMovablePositions, getValidMoves } from '../../../../shared/games/dama/engine/selectors';
import type { DamaState } from '../../../../shared/games/dama/engine/state';
import { pickRandomMove } from './randomMoveStrategy';

describe('pickRandomMove', () => {
  it('returns a legal move for the starting position', () => {
    const state = createInitialState();
    const action = pickRandomMove(state);

    expect(action).not.toBeNull();
    const validTargets = getValidMoves(state, action!.from);
    expect(validTargets).toContainEqual(action!.to);
  });

  it('returns null when the current player has no movable piece', () => {
    const emptyBoardState: DamaState = {
      board: Array.from({ length: 8 }, () => Array(8).fill(null)),
      currentPlayer: 'LIGHT',
      status: 'IN_PROGRESS',
      chainCaptureFrom: null,
    };

    expect(getMovablePositions(emptyBoardState)).toHaveLength(0);
    expect(pickRandomMove(emptyBoardState)).toBeNull();
  });
});
