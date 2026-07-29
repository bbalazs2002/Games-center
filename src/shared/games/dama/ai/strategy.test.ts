import { describe, expect, it } from 'vitest';
import { createInitialState } from '../engine/initialState';
import { reducer } from '../engine/reducer';
import { man, pos, stateWith, withPieces } from '../engine/testHelpers';
import { chooseDamaAiAction, isDamaAiDifficulty, type DamaAiDifficulty } from './strategy';

const DIFFICULTIES: DamaAiDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];

describe('isDamaAiDifficulty', () => {
  it('accepts the three known difficulties and rejects anything else', () => {
    expect(isDamaAiDifficulty('EASY')).toBe(true);
    expect(isDamaAiDifficulty('MEDIUM')).toBe(true);
    expect(isDamaAiDifficulty('HARD')).toBe(true);
    expect(isDamaAiDifficulty('NIGHTMARE')).toBe(false);
    expect(isDamaAiDifficulty(undefined)).toBe(false);
  });
});

describe('chooseDamaAiAction', () => {
  it('returns a legal move for the starting position at every difficulty', () => {
    const state = createInitialState();
    for (const difficulty of DIFFICULTIES) {
      const action = chooseDamaAiAction(state, difficulty);
      expect(action?.type).toBe('MOVE');
    }
  });

  it('returns null when the current player has no movable piece, at every difficulty', () => {
    const state = stateWith({ board: withPieces([]) });
    for (const difficulty of DIFFICULTIES) {
      expect(chooseDamaAiAction(state, difficulty)).toBeNull();
    }
  });

  it('MEDIUM and HARD both avoid walking into an immediate recapture, unlike EASY which has no such guarantee', () => {
    const state = stateWith({
      board: withPieces([
        [pos(4, 4), man('LIGHT')],
        [pos(2, 2), man('DARK')],
      ]),
    });
    const safeMove = { type: 'MOVE', from: pos(4, 4), to: pos(3, 5) };

    expect(chooseDamaAiAction(state, 'MEDIUM')).toEqual(safeMove);
    expect(chooseDamaAiAction(state, 'HARD')).toEqual(safeMove);
  });
});

describe('AI-only full game (smoke test)', () => {
  // Mirrors Hotel-0d/Ramses-0c's own smoke-test philosophy: not asserting the
  // game reaches FINISHED within the cap (a real Dáma game's length isn't
  // tightly bounded), just that driving a real, varied slice of AI decisions
  // across all three difficulties never throws and never gets stuck.
  it(
    'runs many steps without throwing, mixing all three difficulties',
    () => {
      let state = createInitialState();
      const difficultyOf = (): DamaAiDifficulty =>
        DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];

      // Kept modest on purpose: unlike Dáma/Hotel/Ramses's earlier stateless
      // AIs, HARD here runs a real (up to ~200ms) search per move — a much
      // higher step count would make this smoke test slow without adding
      // meaningful coverage. Generous timeout below for the same reason.
      const MAX_STEPS = 60;
      let steps = 0;
      while (state.status === 'IN_PROGRESS' && steps < MAX_STEPS) {
        const action = chooseDamaAiAction(state, difficultyOf());
        if (!action) throw new Error(`No action available at step ${steps} for ${state.currentPlayer}`);
        state = reducer(state, action);
        steps += 1;
      }

      expect(steps).toBeGreaterThan(0);
    },
    20_000,
  );
});
