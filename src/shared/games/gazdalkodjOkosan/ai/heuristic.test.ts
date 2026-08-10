import { describe, expect, it } from 'vitest';
import { createInitialState } from '../engine/initialState';
import { updatePlayer } from '../engine/rules';
import type { GazdalkodjOkosanState, OwnershipStatus } from '../engine/state';
import { evaluateState } from './heuristic';

function twoPlayerState(): GazdalkodjOkosanState {
  return createInitialState(['Alice', 'Bob']);
}

const OWNED_APARTMENT: OwnershipStatus = { kind: 'OWNED_CASH', pricePaid: 30000 };
const OWNED_CAR: OwnershipStatus = { kind: 'OWNED_CASH', pricePaid: 10000 };
const HALF_PAID_CAR: OwnershipStatus = { kind: 'FINANCED', plan: { totalPrice: 15000, remainingBalance: 7500, perTurnPayment: 500 } };
const FRESH_FINANCED_CAR: OwnershipStatus = { kind: 'FINANCED', plan: { totalPrice: 15000, remainingBalance: 13000, perTurnPayment: 500 } };
const ALL_FURNITURE = { konyhabutor: true, mosogep: true, hutoszekreny: true, mosogatogep: true, tuzhely: true, szobabutor: true };
const NO_FURNITURE = { konyhabutor: false, mosogep: false, hutoszekreny: false, mosogatogep: false, tuzhely: false, szobabutor: false };

describe('evaluateState', () => {
  it('scores a bankrupt player far below any non-bankrupt player', () => {
    const bankrupt = updatePlayer(twoPlayerState(), 'player-1', { bankrupt: true, cash: 0, bankAccount: null });
    const notBankrupt = twoPlayerState();
    expect(evaluateState(bankrupt, 'player-1')).toBeLessThan(evaluateState(notBankrupt, 'player-1'));
    expect(evaluateState(bankrupt, 'player-1')).toBeLessThan(-50_000);
  });

  it('more furniture scores higher than less, all else equal', () => {
    const withAll = updatePlayer(twoPlayerState(), 'player-1', { furniture: ALL_FURNITURE });
    const withNone = updatePlayer(twoPlayerState(), 'player-1', { furniture: NO_FURNITURE });
    expect(evaluateState(withAll, 'player-1')).toBeGreaterThan(evaluateState(withNone, 'player-1'));
  });

  it('a fully-owned (cash) apartment scores higher than never having bought one, even at identical totalWealth', () => {
    // Same cash as the untouched starting state (18000) — the only difference is owning the apartment outright.
    const owns = updatePlayer(twoPlayerState(), 'player-1', { apartment: OWNED_APARTMENT, cash: 18000 });
    const doesNotOwn = twoPlayerState();
    expect(evaluateState(owns, 'player-1')).toBeGreaterThan(evaluateState(doesNotOwn, 'player-1'));
  });

  it('a financed car with more principal paid down scores higher than one freshly financed, at identical cash', () => {
    const halfPaid = updatePlayer(twoPlayerState(), 'player-1', { car: HALF_PAID_CAR, cash: 3000 });
    const freshlyFinanced = updatePlayer(twoPlayerState(), 'player-1', { car: FRESH_FINANCED_CAR, cash: 3000 });
    expect(evaluateState(halfPaid, 'player-1')).toBeGreaterThan(evaluateState(freshlyFinanced, 'player-1'));
  });

  it('a fully-paid-off financed car scores the same ownership credit as an outright cash purchase (remainingBalance <= 0)', () => {
    const paidOffFinanced: OwnershipStatus = { kind: 'FINANCED', plan: { totalPrice: 15000, remainingBalance: 0, perTurnPayment: 500 } };
    const financed = updatePlayer(twoPlayerState(), 'player-1', { car: paidOffFinanced, cash: 5000 });
    const cashBought = updatePlayer(twoPlayerState(), 'player-1', { car: OWNED_CAR, cash: 5000 });
    expect(evaluateState(financed, 'player-1')).toBeCloseTo(evaluateState(cashBought, 'player-1'), 5);
  });

  it('a state exactly one win-condition short of victory scores disproportionately higher than one with the same count of conditions met but not adjacent to winning', () => {
    // 4/5 conditions met: apartment+car+furniture+insurance, only wealth (2000) missing.
    const oneAway = updatePlayer(twoPlayerState(), 'player-1', {
      apartment: OWNED_APARTMENT,
      car: OWNED_CAR,
      furniture: ALL_FURNITURE,
      insurance: { life: false, home: false, car: true },
      cash: 0,
    });
    // 3/5 conditions met (missing furniture AND wealth), but same totalWealth (0) and same apartment/car ownership.
    const twoAway = updatePlayer(twoPlayerState(), 'player-1', {
      apartment: OWNED_APARTMENT,
      car: OWNED_CAR,
      furniture: NO_FURNITURE,
      insurance: { life: false, home: false, car: true },
      cash: 0,
    });
    const gap = evaluateState(oneAway, 'player-1') - evaluateState(twoAway, 'player-1');
    // The plain per-item furniture credit for the 6 missing items alone would
    // already account for part of this gap — the CLOSE_TO_WIN_BONUS must push
    // it meaningfully further than that raw per-item sum.
    expect(gap).toBeGreaterThan(6 * 4000);
  });

  it('owning insurance scores higher than not, all else equal', () => {
    const insured = updatePlayer(twoPlayerState(), 'player-1', { car: OWNED_CAR, insurance: { life: false, home: false, car: true } });
    const uninsured = updatePlayer(twoPlayerState(), 'player-1', { car: OWNED_CAR, insurance: { life: false, home: false, car: false } });
    expect(evaluateState(insured, 'player-1')).toBeGreaterThan(evaluateState(uninsured, 'player-1'));
  });

  it('depositing cash into the bank account never lowers the score (no cash-specific safety penalty, only totalWealth matters)', () => {
    const beforeDeposit = updatePlayer(twoPlayerState(), 'player-1', { cash: 5000, bankAccount: { balance: 0 } });
    const afterDeposit = updatePlayer(twoPlayerState(), 'player-1', { cash: 0, bankAccount: { balance: 5000 } });
    expect(evaluateState(afterDeposit, 'player-1')).toBeCloseTo(evaluateState(beforeDeposit, 'player-1'), 5);
  });

  it('low totalWealth is penalized regardless of how it is split between cash and bank balance', () => {
    const lowCashHealthyBank = updatePlayer(twoPlayerState(), 'player-1', { cash: 0, bankAccount: { balance: 100 } });
    const lowBankHealthyCash = updatePlayer(twoPlayerState(), 'player-1', { cash: 100, bankAccount: { balance: 0 } });
    expect(evaluateState(lowCashHealthyBank, 'player-1')).toBeCloseTo(evaluateState(lowBankHealthyCash, 'player-1'), 5);
    const healthy = updatePlayer(twoPlayerState(), 'player-1', { cash: 100, bankAccount: { balance: 10000 } });
    expect(evaluateState(healthy, 'player-1')).toBeGreaterThan(evaluateState(lowBankHealthyCash, 'player-1'));
  });
});
