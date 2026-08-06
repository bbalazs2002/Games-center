import { describe, expect, it } from 'vitest';
import { createInitialState } from '../engine/initialState';
import { reducer } from '../engine/reducer';
import { updateLot, updatePlayer } from '../engine/rules';
import type { HotelState } from '../engine/state';
import { enumerateCandidateActions } from './actionEnumerator';

describe('enumerateCandidateActions — AI auction restraint', () => {
  // Real playtest report: the AI opportunistically auctioned off its own
  // lots just to pad its cash buffer, even with no debt at stake — the
  // voluntary RESOLVING_SPACE auction path (still legal for a human, see
  // rules.ts's canStartAuction) is deliberately excluded from the AI's own
  // candidate list; only the forced AWAITING_DEBT_RESOLUTION path is offered.
  it('never proposes START_AUCTION voluntarily, even holding an auctionable lot mid-turn', () => {
    let state: HotelState = { ...createInitialState(['Alice', 'Bob']), turnPhase: 'RESOLVING_SPACE' };
    state = updateLot(state, 'boomerang', { ownerId: 'player-1' });

    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions.some((a) => a.type === 'START_AUCTION')).toBe(false);
  });

  it('DOES propose START_AUCTION once forced into AWAITING_DEBT_RESOLUTION', () => {
    let state: HotelState = { ...createInitialState(['Alice', 'Bob']), turnPhase: 'AWAITING_DEBT_RESOLUTION', pendingDebt: { amount: 500, creditorId: null } };
    state = updateLot(state, 'boomerang', { ownerId: 'player-1' });
    state = updatePlayer(state, 'player-1', { cash: 0 });

    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions).toContainEqual({ type: 'START_AUCTION', lotId: 'boomerang' });
  });

  it('never surfaces START_AUCTION for a lot just bought this turn either (reducer.test.ts covers the engine-level rule — this confirms the AI-facing candidate list agrees)', () => {
    const onPurchaseSpace = { ...updatePlayer(createInitialState(['Alice', 'Bob']), 'player-1', { position: 2 }), turnPhase: 'RESOLVING_SPACE' as const };
    const state = reducer(onPurchaseSpace, { type: 'BUY_LOT', lotId: 'fujiyama' });

    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions.some((a) => a.type === 'START_AUCTION')).toBe(false);
  });
});
