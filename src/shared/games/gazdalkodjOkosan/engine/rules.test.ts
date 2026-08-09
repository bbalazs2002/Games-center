import { describe, expect, it } from 'vitest';
import { createInitialState } from './initialState';
import { canAckChanceCard, canCancelPayment, canSettlePayment, canWithdrawFromAccount, getPlayer, renamePlayer, updatePlayer } from './rules';

describe('renamePlayer', () => {
  it('replaces the placeholder name with the real one, leaving everything else untouched', () => {
    const state = createInitialState(['1. játékos', '2. játékos']);
    const next = renamePlayer(state, 'player-1', 'Alice');
    expect(getPlayer(next, 'player-1').name).toBe('Alice');
    expect(getPlayer(next, 'player-1').cash).toBe(getPlayer(state, 'player-1').cash);
    expect(getPlayer(next, 'player-2').name).toBe('2. játékos');
  });
});

describe('canAckChanceCard', () => {
  it('true kizárólag AWAITING_CHANCE_CARD_ACK fázisban', () => {
    const state = createInitialState(['1. játékos', '2. játékos']);
    expect(canAckChanceCard(state)).toBe(false);
    expect(canAckChanceCard({ ...state, turnPhase: 'RESOLVING_SPACE' })).toBe(false);
    expect(canAckChanceCard({ ...state, turnPhase: 'AWAITING_CHANCE_CARD_ACK' })).toBe(true);
  });
});

describe('canSettlePayment / canCancelPayment', () => {
  it('canSettlePayment csak AWAITING_PAYMENT alatt igaz, ha van pendingPayment', () => {
    const state = createInitialState(['1. játékos', '2. játékos']);
    expect(canSettlePayment(state)).toBe(false);
    const pending = {
      ...state,
      turnPhase: 'AWAITING_PAYMENT' as const,
      pendingPayment: { amount: 100, reason: { kind: 'SPACE_PAYMENT' as const, spaceIndex: 1, thenSkipNextRoll: false } },
    };
    expect(canSettlePayment(pending)).toBe(true);
    expect(canSettlePayment({ ...pending, pendingPayment: null })).toBe(false);
  });

  it('canCancelPayment csak önkéntes (BUY_*) reason-nél igaz', () => {
    const state = createInitialState(['1. játékos', '2. játékos']);
    const mandatory = {
      ...state,
      turnPhase: 'AWAITING_PAYMENT' as const,
      pendingPayment: { amount: 100, reason: { kind: 'SPACE_PAYMENT' as const, spaceIndex: 1, thenSkipNextRoll: false } },
    };
    expect(canCancelPayment(mandatory)).toBe(false);
    const voluntary = {
      ...state,
      turnPhase: 'AWAITING_PAYMENT' as const,
      pendingPayment: { amount: 100, reason: { kind: 'BUY_BKV_PASS' as const } },
    };
    expect(canCancelPayment(voluntary)).toBe(true);
  });
});

describe('canWithdrawFromAccount', () => {
  it('AWAITING_PAYMENT alatt tiltott, még ha van is fedezet — a motor sem enged más actiont, csak a fizetést', () => {
    const withAccount = updatePlayer(createInitialState(['1. játékos', '2. játékos']), 'player-1', { bankAccount: { balance: 1000 } });
    expect(canWithdrawFromAccount({ ...withAccount, turnPhase: 'RESOLVING_SPACE' }, 500)).toBe(true);
    expect(
      canWithdrawFromAccount(
        {
          ...withAccount,
          turnPhase: 'AWAITING_PAYMENT',
          pendingPayment: { amount: 200, reason: { kind: 'SPACE_PAYMENT', spaceIndex: 1, thenSkipNextRoll: false } },
        },
        500,
      ),
    ).toBe(false);
  });
});
