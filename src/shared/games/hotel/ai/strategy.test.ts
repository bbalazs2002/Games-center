import { describe, expect, it } from 'vitest';
import { createInitialState } from '../engine/initialState';
import { reducer } from '../engine/reducer';
import { getCurrentPlayer, getRemainingBidderIds } from '../engine/rules';
import type { HotelState } from '../engine/state';
import { chooseHotelAiAction, type HotelAiDifficulty } from './index';

const DIFFICULTIES: HotelAiDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];

describe('chooseHotelAiAction', () => {
  it('returns null when the slot has nothing to do right now', () => {
    const state = createInitialState(['Alice', 'Bob']);
    // It's player-1's turn — player-2 isn't the current player and there's no auction.
    expect(chooseHotelAiAction(state, 'player-2', 'MEDIUM')).toBeNull();
  });

  it('rolls the move dice with a real 1-6 value at every difficulty', () => {
    const state = createInitialState(['Alice', 'Bob']);
    for (const difficulty of DIFFICULTIES) {
      const action = chooseHotelAiAction(state, 'player-1', difficulty);
      expect(action?.type).toBe('ROLL_MOVE_DICE');
      if (action?.type === 'ROLL_MOVE_DICE') {
        expect(action.value).toBeGreaterThanOrEqual(1);
        expect(action.value).toBeLessThanOrEqual(6);
      }
    }
  });

  it('never returns FORFEIT when a non-self-sabotaging action exists (fresh AWAITING_ROLL state)', () => {
    const state = createInitialState(['Alice', 'Bob', 'Carol']);
    const action = chooseHotelAiAction(state, 'player-1', 'HARD');
    expect(action?.type).not.toBe('FORFEIT');
  });
});

describe('AI-only full game (smoke test)', () => {
  /** Whoever can legally act right now (current turn-holder, or the first remaining auction bidder) drives one step forward — mirrors GameRoom.tryApplyOneAiMove, simplified for direct engine-level testing (no room/network involved). */
  function driveOneStep(state: HotelState, difficultyOf: (playerId: string) => HotelAiDifficulty): HotelState {
    if (state.turnPhase === 'AUCTION_IN_PROGRESS') {
      for (const bidderId of getRemainingBidderIds(state)) {
        const action = chooseHotelAiAction(state, bidderId, difficultyOf(bidderId));
        if (action) return reducer(state, action);
      }
      throw new Error(`No remaining bidder could act during auction: ${JSON.stringify(state.pendingAuction)}`);
    }
    const currentId = getCurrentPlayer(state).id;
    const action = chooseHotelAiAction(state, currentId, difficultyOf(currentId));
    if (!action) throw new Error(`No action available for ${currentId} in phase ${state.turnPhase}`);
    return reducer(state, action);
  }

  it(
    'runs for many steps without throwing, mixing all three difficulties',
    () => {
      const difficultyByPlayer: Record<string, HotelAiDifficulty> = {
        'player-1': 'EASY',
        'player-2': 'MEDIUM',
        'player-3': 'HARD',
      };
      let state = createInitialState(['Alice', 'Bob', 'Carol']);
      // Not asserting the game always finishes within the cap (Hotel games
      // can run long, and each MEDIUM/HARD decision may spend up to the
      // search's own ~200ms wall-clock budget) — the point of this test is
      // that driving an all-AI game for many steps never throws and never
      // gets stuck returning no action, which is exactly what caught the
      // pre-existing computeNightlyRent crash this test exists to guard
      // against (see rules.ts).
      // Kept modest on purpose — MEDIUM/HARD decision nodes can each spend
      // close to the search's own ~200ms wall-clock budget, so this is about
      // covering a real, varied slice of early/mid-game action types (rolls,
      // purchases, construction, possibly an auction) rather than a full game.
      const MAX_STEPS = 60;
      let steps = 0;
      while (state.status !== 'FINISHED' && steps < MAX_STEPS) {
        state = driveOneStep(state, (id) => difficultyByPlayer[id]);
        steps += 1;
      }
      expect(steps).toBeGreaterThan(0);
    },
    15_000,
  );
});
