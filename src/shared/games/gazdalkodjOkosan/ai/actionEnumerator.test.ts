import { describe, expect, it } from 'vitest';
import { createInitialState } from '../engine/initialState';
import { updatePlayer } from '../engine/rules';
import type { GazdalkodjOkosanState, OwnershipStatus } from '../engine/state';
import { enumerateCandidateActions } from './actionEnumerator';

function twoPlayerState(): GazdalkodjOkosanState {
  return createInitialState(['Alice', 'Bob']);
}

const FINANCED_CAR: OwnershipStatus = {
  kind: 'FINANCED',
  plan: { totalPrice: 15000, remainingBalance: 13000, perTurnPayment: 500 },
};

describe('enumerateCandidateActions — RESOLVING_SPACE', () => {
  it('offers one BUY_FURNITURE candidate per still-affordable, not-yet-owned item on a multi-item space', () => {
    // Space 33 (electrolux) offers mosogep/hutoszekreny/mosogatogep/tuzhely simultaneously.
    const state: GazdalkodjOkosanState = { ...updatePlayer(twoPlayerState(), 'player-1', { position: 33, apartment: { kind: 'OWNED_CASH', pricePaid: 30000 } }), turnPhase: 'RESOLVING_SPACE' };
    const actions = enumerateCandidateActions(state, 'player-1');
    const furnitureActions = actions.filter((a) => a.type === 'BUY_FURNITURE');
    expect(furnitureActions).toHaveLength(4);
    expect(furnitureActions.map((a) => (a.type === 'BUY_FURNITURE' ? a.item : null)).sort()).toEqual(
      ['hutoszekreny', 'mosogatogep', 'mosogep', 'tuzhely'].sort(),
    );
  });

  it('never offers BUY_FURNITURE for an item without an owned apartment', () => {
    const state: GazdalkodjOkosanState = { ...updatePlayer(twoPlayerState(), 'player-1', { position: 33 }), turnPhase: 'RESOLVING_SPACE' };
    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions.some((a) => a.type === 'BUY_FURNITURE')).toBe(false);
  });

  it('offers both financed and cash BUY_APARTMENT candidates when both are affordable', () => {
    const state: GazdalkodjOkosanState = { ...updatePlayer(twoPlayerState(), 'player-1', { position: 19, cash: 40000 }), turnPhase: 'RESOLVING_SPACE' };
    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions).toContainEqual({ type: 'BUY_APARTMENT', financed: false });
    expect(actions).toContainEqual({ type: 'BUY_APARTMENT', financed: true });
  });

  it('deposits the FULL cash balance, never a partial amount (2026-08-09 user decision — the bank is exactly as liquid as cash)', () => {
    const state: GazdalkodjOkosanState = {
      ...updatePlayer(twoPlayerState(), 'player-1', { position: 8, bankAccount: { balance: 0 }, cash: 12345 }),
      turnPhase: 'RESOLVING_SPACE',
    };
    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions).toContainEqual({ type: 'DEPOSIT_TO_ACCOUNT', amount: 12345 });
  });

  it('NEVER offers WITHDRAW_FROM_ACCOUNT, even with a healthy bank balance and an outstanding payment need elsewhere', () => {
    const state: GazdalkodjOkosanState = {
      ...updatePlayer(twoPlayerState(), 'player-1', { bankAccount: { balance: 5000 } }),
      turnPhase: 'RESOLVING_SPACE',
    };
    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions.some((a) => a.type === 'WITHDRAW_FROM_ACCOUNT')).toBe(false);
  });

  it('includes END_TURN once nothing mandatory is outstanding', () => {
    const state: GazdalkodjOkosanState = { ...twoPlayerState(), turnPhase: 'RESOLVING_SPACE' };
    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions).toContainEqual({ type: 'END_TURN' });
  });

  it('excludes END_TURN while a mandatory Szerencsekerék draw is still pending', () => {
    const state: GazdalkodjOkosanState = { ...updatePlayer(twoPlayerState(), 'player-1', { position: 3 }), turnPhase: 'RESOLVING_SPACE', pendingMandatoryChanceDraw: true };
    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions.some((a) => a.type === 'END_TURN')).toBe(false);
    expect(actions).toContainEqual({ type: 'DRAW_CHANCE_CARD' });
  });
});

describe('enumerateCandidateActions — AWAITING_MANDATORY_INSTALLMENT', () => {
  it('offers a minimum-payment candidate for every pending loan, and an early-payoff candidate only when affordable and actually larger', () => {
    const state: GazdalkodjOkosanState = {
      ...updatePlayer(twoPlayerState(), 'player-1', { car: FINANCED_CAR, cash: 20000 }),
      turnPhase: 'AWAITING_MANDATORY_INSTALLMENT',
      pendingMandatoryInstallments: ['car'],
    };
    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions).toContainEqual({ type: 'PAY_CAR_INSTALLMENT' });
    expect(actions).toContainEqual({ type: 'PAY_CAR_INSTALLMENT', amount: 13000 }); // full remaining balance, affordable
    expect(actions).toHaveLength(2);
  });

  it('does NOT offer an early-payoff candidate when the player cannot afford the full remaining balance', () => {
    const state: GazdalkodjOkosanState = {
      ...updatePlayer(twoPlayerState(), 'player-1', { car: FINANCED_CAR, cash: 600 }),
      turnPhase: 'AWAITING_MANDATORY_INSTALLMENT',
      pendingMandatoryInstallments: ['car'],
    };
    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions).toEqual([{ type: 'PAY_CAR_INSTALLMENT' }]);
  });

  it('offers candidates for BOTH loans when both are pending simultaneously', () => {
    const almostPaidApartment: OwnershipStatus = { kind: 'FINANCED', plan: { totalPrice: 35000, remainingBalance: 500, perTurnPayment: 500 } };
    const state: GazdalkodjOkosanState = {
      ...updatePlayer(twoPlayerState(), 'player-1', { car: FINANCED_CAR, apartment: almostPaidApartment, cash: 20000 }),
      turnPhase: 'AWAITING_MANDATORY_INSTALLMENT',
      pendingMandatoryInstallments: ['car', 'apartment'],
    };
    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions).toContainEqual({ type: 'PAY_CAR_INSTALLMENT' });
    expect(actions).toContainEqual({ type: 'PAY_APARTMENT_INSTALLMENT' });
    // Apartment's remaining balance (500) === its own minimum (500), so no separate early-payoff candidate for it.
    expect(actions.filter((a) => a.type === 'PAY_APARTMENT_INSTALLMENT')).toHaveLength(1);
  });
});

describe('enumerateCandidateActions — AWAITING_CHANCE_CARD_ACK', () => {
  it('offers exactly one ACK_CHANCE_CARD candidate, no real choice', () => {
    const state: GazdalkodjOkosanState = { ...twoPlayerState(), turnPhase: 'AWAITING_CHANCE_CARD_ACK', pendingChanceCardEffect: { kind: 'MONEY_DELTA', amount: 100 } };
    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions).toEqual([{ type: 'ACK_CHANCE_CARD' }]);
  });
});

describe('enumerateCandidateActions — AWAITING_PAYMENT', () => {
  it('offers exactly one SETTLE_PAYMENT candidate, cash-first then bank for the remainder', () => {
    const state: GazdalkodjOkosanState = {
      ...updatePlayer(twoPlayerState(), 'player-1', { cash: 50, bankAccount: { balance: 500 } }),
      turnPhase: 'AWAITING_PAYMENT',
      pendingPayment: { amount: 100, reason: { kind: 'SPACE_PAYMENT', spaceIndex: 1, thenSkipNextRoll: false } },
    };
    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions).toEqual([{ type: 'SETTLE_PAYMENT', cashAmount: 50, bankAmount: 50 }]);
  });

  it('covers the full amount from cash alone when cash is enough, leaving the bank untouched', () => {
    const state: GazdalkodjOkosanState = {
      ...updatePlayer(twoPlayerState(), 'player-1', { cash: 5000, bankAccount: { balance: 500 } }),
      turnPhase: 'AWAITING_PAYMENT',
      pendingPayment: { amount: 100, reason: { kind: 'BUY_BKV_PASS' } },
    };
    const actions = enumerateCandidateActions(state, 'player-1');
    expect(actions).toEqual([{ type: 'SETTLE_PAYMENT', cashAmount: 100, bankAmount: 0 }]);
  });
});
