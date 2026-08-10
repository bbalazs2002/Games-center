import { describe, expect, it } from 'vitest';
import { createInitialState } from '../engine/initialState';
import { reducer } from '../engine/reducer';
import { getCurrentPlayer, updatePlayer } from '../engine/rules';
import type { GazdalkodjOkosanState } from '../engine/state';
import { chooseGazdalkodjOkosanAiAction, type GazdalkodjOkosanAiDifficulty } from './index';

const DIFFICULTIES: GazdalkodjOkosanAiDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];

describe('chooseGazdalkodjOkosanAiAction', () => {
  it('returns null when the slot is not the current turn-holder (no out-of-turn actor in this engine)', () => {
    const state = createInitialState(['Alice', 'Bob']);
    expect(chooseGazdalkodjOkosanAiAction(state, 'player-2', 'MEDIUM')).toBeNull();
  });

  it('returns null once the game has finished', () => {
    const state: GazdalkodjOkosanState = { ...createInitialState(['Alice', 'Bob']), status: 'FINISHED', winnerId: 'player-1' };
    expect(chooseGazdalkodjOkosanAiAction(state, 'player-1', 'MEDIUM')).toBeNull();
  });

  it('rolls the move dice with a real 1-6 value at every difficulty', () => {
    const state = createInitialState(['Alice', 'Bob']);
    for (const difficulty of DIFFICULTIES) {
      const action = chooseGazdalkodjOkosanAiAction(state, 'player-1', difficulty);
      expect(action?.type).toBe('ROLL_MOVE_DICE');
      if (action?.type === 'ROLL_MOVE_DICE') {
        expect(action.value).toBeGreaterThanOrEqual(1);
        expect(action.value).toBeLessThanOrEqual(6);
      }
    }
  });

  it('always confirms a drawn chance card (no real choice in AWAITING_CHANCE_CARD_ACK)', () => {
    const state: GazdalkodjOkosanState = {
      ...createInitialState(['Alice', 'Bob']),
      turnPhase: 'AWAITING_CHANCE_CARD_ACK',
      pendingChanceCardEffect: { kind: 'MONEY_DELTA', amount: 100 },
    };
    const action = chooseGazdalkodjOkosanAiAction(state, 'player-1', 'HARD');
    expect(action).toEqual({ type: 'ACK_CHANCE_CARD' });
  });

  it('buys an available, affordable item on the space it just landed on rather than ending the turn empty-handed, even at EASY', () => {
    const state = updatePlayer(createInitialState(['Alice', 'Bob']), 'player-1', { position: 1 });
    // From position 1, rolling a 1 lands on space 2 (BKV_PASS, 200 EUR, well within starting cash).
    const onBkvSpace = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    const action = chooseGazdalkodjOkosanAiAction(onBkvSpace, 'player-1', 'EASY');
    expect(action).toEqual({ type: 'BUY_BKV_PASS' });
  });

  it('settles a pending payment with a valid cash/bank split rather than getting stuck', () => {
    const state: GazdalkodjOkosanState = {
      ...updatePlayer(createInitialState(['Alice', 'Bob']), 'player-1', { cash: 50, bankAccount: { balance: 500 } }),
      turnPhase: 'AWAITING_PAYMENT',
      pendingPayment: { amount: 100, reason: { kind: 'SPACE_PAYMENT', spaceIndex: 1, thenSkipNextRoll: false } },
    };
    const action = chooseGazdalkodjOkosanAiAction(state, 'player-1', 'MEDIUM');
    expect(action).toEqual({ type: 'SETTLE_PAYMENT', cashAmount: 50, bankAmount: 50 });
  });
});

describe('AI-only full game (smoke test)', () => {
  /** The current turn-holder always drives — no out-of-turn actor exists in this engine (unlike Hotel's auction). Mirrors GameRoom.tryApplyOneAiMove, simplified for direct engine-level testing. */
  function driveOneStep(state: GazdalkodjOkosanState, difficultyOf: (playerId: string) => GazdalkodjOkosanAiDifficulty): GazdalkodjOkosanState {
    const currentId = getCurrentPlayer(state).id;
    const action = chooseGazdalkodjOkosanAiAction(state, currentId, difficultyOf(currentId));
    if (!action) throw new Error(`No action available for ${currentId} in phase ${state.turnPhase}`);
    return reducer(state, action);
  }

  it(
    'runs for many steps without throwing, mixing all three difficulties',
    () => {
      const difficultyByPlayer: Record<string, GazdalkodjOkosanAiDifficulty> = {
        'player-1': 'EASY',
        'player-2': 'MEDIUM',
        'player-3': 'HARD',
      };
      let state = createInitialState(['Alice', 'Bob', 'Carol']);
      // Not asserting the game always finishes within the cap — the point is
      // that driving an all-AI game for many steps never throws and never
      // gets stuck returning no action for the current player, covering a
      // real, varied slice of action types (rolls, installments, chance
      // cards, payments, purchases, bankruptcy, end-of-turn).
      const MAX_STEPS = 400;
      let steps = 0;
      while (state.status !== 'FINISHED' && steps < MAX_STEPS) {
        state = driveOneStep(state, (id) => difficultyByPlayer[id]);
        steps += 1;
      }
      expect(steps).toBeGreaterThan(0);
    },
    20_000,
  );
});
