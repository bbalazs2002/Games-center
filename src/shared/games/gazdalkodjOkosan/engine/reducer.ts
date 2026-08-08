import type { GazdalkodjOkosanAction } from './actions';
import {
  APARTMENT_PURCHASE_TERMS,
  BANK_INTEREST_RATE,
  BANK_SPACE_INDEX,
  BKV_PASS_SPACE_INDEX,
  CAR_PURCHASE_TERMS,
  CAR_THEFT_MAX_PAYOUT,
  INSURANCE_PRICES,
} from './boardConfig';
import { ALL_FURNITURE_ITEMS, FURNITURE_CATALOG } from './furnitureCatalog';
import {
  appendLog,
  canBuyApartment,
  canAffordApartment,
  canBuyBkvPass,
  canBuyCar,
  canAffordCar,
  canBuyFurniture,
  canBuyInsurance,
  canDepositToAccount,
  canDrawChanceCard,
  canEndTurn,
  canOpenBankAccount,
  canPayInstallment,
  canRollMoveDice,
  canWithdrawFromAccount,
  getCurrentPlayer,
  getCurrentSpace,
  getPlayer,
  getSpace,
  hasWon,
  nextActivePlayerIndex,
  updatePlayer,
} from './rules';
import type { BoardSpace, ChanceCardEffect, FurnitureItemId, GazdalkodjOkosanState, OwnershipStatus, Player, PlayerId } from './state';

function clearedFurnitureRecord(): Record<FurnitureItemId, boolean> {
  return Object.fromEntries(ALL_FURNITURE_ITEMS.map((item) => [item, false])) as Record<FurnitureItemId, boolean>;
}

function creditPlayer(state: GazdalkodjOkosanState, playerId: PlayerId, amount: number): GazdalkodjOkosanState {
  if (amount <= 0) return state;
  const player = getPlayer(state, playerId);
  return updatePlayer(state, playerId, { cash: player.cash + amount });
}

/** Aki nem tudja kifizetni a kötelező összeget, azonnal kiesik — nincs adósság-/árverés-mechanika ebben a játékban (docs/gazdalkodj-okosan-0a-specifikacio.md §2.1). */
function bankruptPlayer(state: GazdalkodjOkosanState, playerId: PlayerId): GazdalkodjOkosanState {
  let next = updatePlayer(state, playerId, {
    bankrupt: true,
    cash: 0,
    bankAccount: null,
    furniture: clearedFurnitureRecord(),
  });
  next = { ...next, pendingMandatoryInstallments: [] };
  next = appendLog(next, { type: 'BANKRUPT', playerId });
  return finishTurn(next);
}

function chargePlayer(state: GazdalkodjOkosanState, playerId: PlayerId, amount: number): GazdalkodjOkosanState {
  if (amount <= 0) return state;
  const player = getPlayer(state, playerId);
  if (player.cash >= amount) return updatePlayer(state, playerId, { cash: player.cash - amount });
  return bankruptPlayer(state, playerId);
}

function checkWinCondition(state: GazdalkodjOkosanState, playerId: PlayerId): GazdalkodjOkosanState {
  if (!hasWon(getPlayer(state, playerId))) return state;
  const next: GazdalkodjOkosanState = { ...state, status: 'FINISHED', winnerId: playerId };
  return appendLog(next, { type: 'GAME_WON', playerId });
}

function finishTurn(state: GazdalkodjOkosanState): GazdalkodjOkosanState {
  const currentPlayer = getCurrentPlayer(state);
  const checked = currentPlayer.bankrupt ? state : checkWinCondition(state, currentPlayer.id);
  if (checked.status === 'FINISHED') return { ...checked, turnPhase: 'TURN_COMPLETE' };

  if (!currentPlayer.bankrupt && currentPlayer.extraRollsPending > 0) {
    const withDecrementedRolls = updatePlayer(checked, currentPlayer.id, { extraRollsPending: currentPlayer.extraRollsPending - 1 });
    return { ...withDecrementedRolls, turnPhase: 'AWAITING_ROLL', pendingMandatoryInstallments: [], lastDiceRoll: null };
  }

  return {
    ...checked,
    currentPlayerIndex: nextActivePlayerIndex(checked),
    turnPhase: 'AWAITING_ROLL',
    pendingMandatoryInstallments: [],
    lastDiceRoll: null,
  };
}

interface AdvanceResult {
  state: GazdalkodjOkosanState;
  startBonus: 0 | 2000 | 4000;
}

/**
 * A játékosok MINDIG előre (óramutató irányba) haladnak — ezt hívja a
 * ROLL_MOVE_DICE ÉS a Szerencsekártya MOVE_TO hatása is (moveAndLog-on
 * keresztül), így a START-bónusz ÉS a 8-as mezős kamat logikája egyetlen
 * helyen él, nem duplikálódik (docs/gazdalkodj-okosan-0a-specifikacio.md §2.1/§3).
 */
function advanceForward(state: GazdalkodjOkosanState, playerId: PlayerId, steps: number): AdvanceResult {
  const boardLength = state.board.length;
  let position = getPlayer(state, playerId).position;
  let crossedStart = false;
  let landedOnStart = false;
  let crossedOrLandedOnBank = false;
  for (let i = 0; i < steps; i += 1) {
    position = (position + 1) % boardLength;
    if (position === BANK_SPACE_INDEX) crossedOrLandedOnBank = true;
    if (position === 0) {
      if (i === steps - 1) landedOnStart = true;
      else crossedStart = true;
    }
  }
  const startBonus: 0 | 2000 | 4000 = landedOnStart ? 4000 : crossedStart ? 2000 : 0;

  let next = updatePlayer(state, playerId, { position });
  if (startBonus > 0) next = creditPlayer(next, playerId, startBonus);
  if (crossedOrLandedOnBank) next = applyBankInterestIfAny(next, playerId);
  return { state: next, startBonus };
}

function applyBankInterestIfAny(state: GazdalkodjOkosanState, playerId: PlayerId): GazdalkodjOkosanState {
  const player = getPlayer(state, playerId);
  if (!player.bankAccount) return state;
  const interest = Math.round(player.bankAccount.balance * BANK_INTEREST_RATE);
  if (interest <= 0) return state;
  const next = updatePlayer(state, playerId, { bankAccount: { balance: player.bankAccount.balance + interest } });
  return appendLog(next, { type: 'INTEREST_PAID', playerId, amount: interest, source: 'FIELD_8' });
}

function moveAndLog(state: GazdalkodjOkosanState, playerId: PlayerId, steps: number): AdvanceResult {
  const fromIndex = getPlayer(state, playerId).position;
  const { state: moved, startBonus } = advanceForward(state, playerId, steps);
  const toIndex = getPlayer(moved, playerId).position;
  return { state: appendLog(moved, { type: 'MOVED', playerId, fromIndex, toIndex, startBonus }), startBonus };
}

function stepsToward(state: GazdalkodjOkosanState, playerId: PlayerId, targetIndex: number): number {
  const boardLength = state.board.length;
  return (targetIndex - getPlayer(state, playerId).position + boardLength) % boardLength;
}

function computePendingInstallments(player: Player): ('car' | 'apartment')[] {
  const pending: ('car' | 'apartment')[] = [];
  if (player.car.kind === 'FINANCED' && player.car.plan.remainingBalance > 0) pending.push('car');
  if (player.apartment.kind === 'FINANCED' && player.apartment.plan.remainingBalance > 0) pending.push('apartment');
  return pending;
}

function resolveHospitalSpace(state: GazdalkodjOkosanState, playerId: PlayerId): GazdalkodjOkosanState {
  const next = updatePlayer(state, playerId, { inHospital: true, hospitalRollAttempts: 0 });
  return finishTurn(appendLog(next, { type: 'HOSPITAL_ENTERED', playerId }));
}

function resolvePaySpace(state: GazdalkodjOkosanState, playerId: PlayerId, space: BoardSpace): GazdalkodjOkosanState {
  const next = chargePlayer(state, playerId, space.amount ?? 0);
  if (getPlayer(next, playerId).bankrupt) return next;
  let logged = appendLog(next, { type: 'SPACE_PAYMENT', playerId, spaceIndex: space.index, amount: space.amount ?? 0 });
  if (space.type === 'PAY_AND_SKIP') logged = updatePlayer(logged, playerId, { skipNextRoll: true });
  return { ...logged, turnPhase: 'RESOLVING_SPACE' };
}

function resolveChanceSpace(state: GazdalkodjOkosanState, playerId: PlayerId, space: BoardSpace): GazdalkodjOkosanState {
  const missingPass = space.requiresBkvPass && !getPlayer(state, playerId).hasBkvPass;
  const next = missingPass ? appendLog(state, { type: 'CHANCE_CARD_SKIPPED_NO_PASS', playerId }) : state;
  return { ...next, turnPhase: 'RESOLVING_SPACE' };
}

function resolveExtraRollRewardSpace(state: GazdalkodjOkosanState, playerId: PlayerId, space: BoardSpace): GazdalkodjOkosanState {
  const player = getPlayer(state, playerId);
  if (space.requiresBkvPass && !player.hasBkvPass) {
    return { ...appendLog(state, { type: 'BKV_REWARD_SKIPPED_NO_PASS', playerId }), turnPhase: 'RESOLVING_SPACE' };
  }
  const next = updatePlayer(state, playerId, { extraRollsPending: player.extraRollsPending + 2 });
  return { ...appendLog(next, { type: 'EXTRA_ROLL_GRANTED', playerId, count: 2 }), turnPhase: 'RESOLVING_SPACE' };
}

/** A landolt mező kötelező, automatikus hatása — csak akkor fut le, amikor nincs (több) esedékes kötelező törlesztés. */
function resolveLandedSpace(state: GazdalkodjOkosanState, playerId: PlayerId): GazdalkodjOkosanState {
  const space = getSpace(state, getPlayer(state, playerId).position);
  switch (space.type) {
    case 'HOSPITAL':
      return resolveHospitalSpace(state, playerId);
    case 'PAY':
    case 'PAY_AND_SKIP':
      return resolvePaySpace(state, playerId, space);
    case 'CHANCE':
      return resolveChanceSpace(state, playerId, space);
    case 'EXTRA_ROLL_REWARD':
      return resolveExtraRollRewardSpace(state, playerId, space);
    default:
      return { ...state, turnPhase: 'RESOLVING_SPACE' };
  }
}

/** A tűzeset/autólopás kártya biztosítás nélküli ága a 9-es (biztosítási) mezőre küldi a játékost — ugyanazt az előre-lépő mechanikát használva, mint bármely más mozgás. */
function sendToInsuranceField(state: GazdalkodjOkosanState, playerId: PlayerId): GazdalkodjOkosanState {
  return moveAndLog(state, playerId, stepsToward(state, playerId, 9)).state;
}

function applyMoveToEffect(
  state: GazdalkodjOkosanState,
  playerId: PlayerId,
  effect: Extract<ChanceCardEffect, { kind: 'MOVE_TO' }>,
): GazdalkodjOkosanState {
  const { state: moved } = moveAndLog(state, playerId, stepsToward(state, playerId, effect.targetIndex));
  let next = moved;
  if (effect.thenPay) {
    next = chargePlayer(next, playerId, effect.thenPay);
    if (getPlayer(next, playerId).bankrupt) return next;
  }
  if (effect.thenExtraRoll) {
    const player = getPlayer(next, playerId);
    next = updatePlayer(next, playerId, { extraRollsPending: player.extraRollsPending + 1 });
  }
  return next;
}

function applyGainFurnitureEffect(
  state: GazdalkodjOkosanState,
  playerId: PlayerId,
  effect: Extract<ChanceCardEffect, { kind: 'GAIN_FURNITURE' }>,
): GazdalkodjOkosanState {
  const player = getPlayer(state, playerId);
  if (player.apartment.kind === 'NONE') {
    const next = creditPlayer(state, playerId, effect.cashIfNoApartment);
    return appendLog(next, { type: 'FURNITURE_GAINED_FROM_CARD', playerId, item: effect.item, cashInstead: true });
  }
  if (player.furniture[effect.item]) {
    const next = creditPlayer(state, playerId, effect.cashIfAlreadyOwned);
    return appendLog(next, { type: 'FURNITURE_GAINED_FROM_CARD', playerId, item: effect.item, cashInstead: true });
  }
  const next = updatePlayer(state, playerId, { furniture: { ...player.furniture, [effect.item]: true } });
  return appendLog(next, { type: 'FURNITURE_GAINED_FROM_CARD', playerId, item: effect.item, cashInstead: false });
}

function applyFireEventEffect(state: GazdalkodjOkosanState, playerId: PlayerId): GazdalkodjOkosanState {
  const player = getPlayer(state, playerId);
  const insured = player.insurance.home;
  const payout = insured
    ? ALL_FURNITURE_ITEMS.reduce((sum, item) => sum + (player.furniture[item] ? FURNITURE_CATALOG[item].price : 0), 0)
    : 0;
  let next = updatePlayer(state, playerId, { furniture: clearedFurnitureRecord() });
  next = creditPlayer(next, playerId, payout);
  next = appendLog(next, { type: 'FIRE_EVENT', playerId, insured, payout });
  return insured ? next : sendToInsuranceField(next, playerId);
}

function applyCarTheftEffect(state: GazdalkodjOkosanState, playerId: PlayerId): GazdalkodjOkosanState {
  const player = getPlayer(state, playerId);
  const paidSoFar = player.car.kind === 'OWNED_CASH' ? player.car.pricePaid : player.car.kind === 'FINANCED' ? player.car.plan.totalPrice - player.car.plan.remainingBalance : 0;
  const insured = player.insurance.car;
  const payout = insured ? Math.min(paidSoFar, CAR_THEFT_MAX_PAYOUT) : 0;
  let next = updatePlayer(state, playerId, { car: { kind: 'NONE' } });
  next = creditPlayer(next, playerId, payout);
  next = appendLog(next, { type: 'CAR_THEFT', playerId, insured, payout });
  return insured ? next : sendToInsuranceField(next, playerId);
}

function applyImmediateInterestEffect(
  state: GazdalkodjOkosanState,
  playerId: PlayerId,
  effect: Extract<ChanceCardEffect, { kind: 'IMMEDIATE_INTEREST' }>,
): GazdalkodjOkosanState {
  const player = getPlayer(state, playerId);
  if (!player.bankAccount) return state;
  const interest = Math.round(player.bankAccount.balance * (effect.ratePercent / 100));
  if (interest <= 0) return state;
  const next = updatePlayer(state, playerId, { bankAccount: { balance: player.bankAccount.balance + interest } });
  return appendLog(next, { type: 'INTEREST_PAID', playerId, amount: interest, source: 'CHANCE_CARD' });
}

function applyChanceCardEffect(state: GazdalkodjOkosanState, playerId: PlayerId, effect: ChanceCardEffect): GazdalkodjOkosanState {
  switch (effect.kind) {
    case 'MONEY_DELTA':
      return effect.amount >= 0 ? creditPlayer(state, playerId, effect.amount) : chargePlayer(state, playerId, -effect.amount);
    case 'MOVE_TO':
      return applyMoveToEffect(state, playerId, effect);
    case 'GAIN_FURNITURE':
      return applyGainFurnitureEffect(state, playerId, effect);
    case 'FIRE_EVENT':
      return applyFireEventEffect(state, playerId);
    case 'CAR_THEFT':
      return applyCarTheftEffect(state, playerId);
    case 'IMMEDIATE_INTEREST':
      return applyImmediateInterestEffect(state, playerId, effect);
    default:
      return state;
  }
}

function applyRollMoveDice(state: GazdalkodjOkosanState, diceValue: number): GazdalkodjOkosanState {
  if (!canRollMoveDice(state)) return state;
  const player = getCurrentPlayer(state);
  let next: GazdalkodjOkosanState = {
    ...appendLog(state, { type: 'DICE_ROLLED', playerId: player.id, value: diceValue }),
    lastDiceRoll: diceValue,
  };

  if (player.skipNextRoll) {
    next = updatePlayer(next, player.id, { skipNextRoll: false });
    return finishTurn(appendLog(next, { type: 'SKIPPED_TURN', playerId: player.id }));
  }

  if (player.inHospital) {
    const canLeave = diceValue === 1 || diceValue === 6 || player.hospitalRollAttempts >= 2;
    if (!canLeave) {
      next = updatePlayer(next, player.id, { hospitalRollAttempts: player.hospitalRollAttempts + 1 });
      return finishTurn(appendLog(next, { type: 'HOSPITAL_ROLL_FAILED', playerId: player.id, value: diceValue }));
    }
    next = updatePlayer(next, player.id, { inHospital: false, hospitalRollAttempts: 0 });
    next = appendLog(next, { type: 'HOSPITAL_EXITED', playerId: player.id });
  }

  const { state: moved, startBonus } = moveAndLog(next, player.id, diceValue);
  next = moved;

  const pending = startBonus > 0 ? computePendingInstallments(getPlayer(next, player.id)) : [];
  if (pending.length > 0) {
    return { ...next, pendingMandatoryInstallments: pending, turnPhase: 'AWAITING_MANDATORY_INSTALLMENT' };
  }
  return resolveLandedSpace(next, player.id);
}

function applyPayInstallment(state: GazdalkodjOkosanState, loan: 'car' | 'apartment', amount: number | undefined): GazdalkodjOkosanState {
  if (!canPayInstallment(state, loan)) return state;
  const player = getCurrentPlayer(state);
  const status = loan === 'car' ? player.car : player.apartment;
  if (status.kind !== 'FINANCED') return state;

  const minimumRequired = Math.min(status.plan.perTurnPayment, status.plan.remainingBalance);
  const requested = amount ?? minimumRequired;
  if (requested < minimumRequired) return state;
  const payment = Math.min(requested, status.plan.remainingBalance);

  let next = chargePlayer(state, player.id, payment);
  if (getPlayer(next, player.id).bankrupt) return next;

  const remainingBalance = status.plan.remainingBalance - payment;
  const paidOff = remainingBalance <= 0;
  const newStatus: OwnershipStatus = paidOff
    ? { kind: 'OWNED_CASH', pricePaid: status.plan.totalPrice }
    : { kind: 'FINANCED', plan: { ...status.plan, remainingBalance } };
  next = updatePlayer(next, player.id, loan === 'car' ? { car: newStatus } : { apartment: newStatus });
  next = appendLog(next, { type: 'INSTALLMENT_PAID', playerId: player.id, loan, amount: payment, paidOff });

  const remainingPending = state.pendingMandatoryInstallments.filter((l) => l !== loan);
  if (remainingPending.length > 0) return { ...next, pendingMandatoryInstallments: remainingPending };
  return resolveLandedSpace(next, player.id);
}

function applyOpenBankAccount(state: GazdalkodjOkosanState): GazdalkodjOkosanState {
  if (!canOpenBankAccount(state)) return state;
  const player = getCurrentPlayer(state);
  const next = updatePlayer(state, player.id, { bankAccount: { balance: 0 } });
  return appendLog(next, { type: 'BANK_ACCOUNT_OPENED', playerId: player.id });
}

function applyDeposit(state: GazdalkodjOkosanState, amount: number): GazdalkodjOkosanState {
  if (!canDepositToAccount(state, amount)) return state;
  const player = getCurrentPlayer(state);
  if (!player.bankAccount) return state;
  const next = updatePlayer(state, player.id, {
    cash: player.cash - amount,
    bankAccount: { balance: player.bankAccount.balance + amount },
  });
  return appendLog(next, { type: 'MONEY_TRANSFERRED', playerId: player.id, direction: 'DEPOSIT', amount });
}

function applyWithdraw(state: GazdalkodjOkosanState, amount: number): GazdalkodjOkosanState {
  if (!canWithdrawFromAccount(state, amount)) return state;
  const player = getCurrentPlayer(state);
  if (!player.bankAccount) return state;
  const next = updatePlayer(state, player.id, {
    cash: player.cash + amount,
    bankAccount: { balance: player.bankAccount.balance - amount },
  });
  return appendLog(next, { type: 'MONEY_TRANSFERRED', playerId: player.id, direction: 'WITHDRAW', amount });
}

function applyEndTurn(state: GazdalkodjOkosanState): GazdalkodjOkosanState {
  if (!canEndTurn(state)) return state;
  return finishTurn(state);
}

function dispatchTurnAndMoney(state: GazdalkodjOkosanState, action: GazdalkodjOkosanAction): GazdalkodjOkosanState | undefined {
  switch (action.type) {
    case 'ROLL_MOVE_DICE':
      return applyRollMoveDice(state, action.value);
    case 'PAY_APARTMENT_INSTALLMENT':
      return applyPayInstallment(state, 'apartment', action.amount);
    case 'PAY_CAR_INSTALLMENT':
      return applyPayInstallment(state, 'car', action.amount);
    case 'OPEN_BANK_ACCOUNT':
      return applyOpenBankAccount(state);
    case 'DEPOSIT_TO_ACCOUNT':
      return applyDeposit(state, action.amount);
    case 'WITHDRAW_FROM_ACCOUNT':
      return applyWithdraw(state, action.amount);
    case 'END_TURN':
      return applyEndTurn(state);
    default:
      return undefined;
  }
}

function applyBuyApartment(state: GazdalkodjOkosanState, financed: boolean): GazdalkodjOkosanState {
  if (!canBuyApartment(state)) return state;
  const player = getCurrentPlayer(state);
  if (!canAffordApartment(player, financed)) return state;
  const terms = APARTMENT_PURCHASE_TERMS;
  const status: OwnershipStatus = financed
    ? { kind: 'FINANCED', plan: { totalPrice: terms.financedTotal, remainingBalance: terms.financedTotal - terms.downPayment, perTurnPayment: terms.perTurnPayment } }
    : { kind: 'OWNED_CASH', pricePaid: terms.cashPrice };
  const paid = financed ? terms.downPayment : terms.cashPrice;
  const next = updatePlayer(state, player.id, { cash: player.cash - paid, apartment: status });
  return appendLog(next, { type: 'APARTMENT_PURCHASED', playerId: player.id, financed });
}

function applyBuyCar(state: GazdalkodjOkosanState, financed: boolean): GazdalkodjOkosanState {
  if (!canBuyCar(state)) return state;
  const player = getCurrentPlayer(state);
  if (!canAffordCar(player, financed)) return state;
  const terms = CAR_PURCHASE_TERMS;
  const status: OwnershipStatus = financed
    ? { kind: 'FINANCED', plan: { totalPrice: terms.financedTotal, remainingBalance: terms.financedTotal - terms.downPayment, perTurnPayment: terms.perTurnPayment } }
    : { kind: 'OWNED_CASH', pricePaid: terms.cashPrice };
  const paid = financed ? terms.downPayment : terms.cashPrice;
  const next = updatePlayer(state, player.id, { cash: player.cash - paid, car: status });
  return appendLog(next, { type: 'CAR_PURCHASED', playerId: player.id, financed });
}

function applyBuyFurniture(state: GazdalkodjOkosanState, item: FurnitureItemId): GazdalkodjOkosanState {
  if (!canBuyFurniture(state, item)) return state;
  const player = getCurrentPlayer(state);
  const price = FURNITURE_CATALOG[item].price;
  const next = updatePlayer(state, player.id, { cash: player.cash - price, furniture: { ...player.furniture, [item]: true } });
  return appendLog(next, { type: 'FURNITURE_PURCHASED', playerId: player.id, item });
}

function applyBuyInsurance(state: GazdalkodjOkosanState, policy: 'life' | 'home' | 'car'): GazdalkodjOkosanState {
  if (!canBuyInsurance(state, policy)) return state;
  const player = getCurrentPlayer(state);
  const price = INSURANCE_PRICES[policy];
  const next = updatePlayer(state, player.id, { cash: player.cash - price, insurance: { ...player.insurance, [policy]: true } });
  return appendLog(next, { type: 'INSURANCE_BOUGHT', playerId: player.id, policy });
}

function applyBuyBkvPass(state: GazdalkodjOkosanState): GazdalkodjOkosanState {
  if (!canBuyBkvPass(state)) return state;
  const player = getCurrentPlayer(state);
  const price = getSpace(state, BKV_PASS_SPACE_INDEX).amount ?? 0;
  const next = updatePlayer(state, player.id, { cash: player.cash - price, hasBkvPass: true });
  return appendLog(next, { type: 'BKV_PASS_PURCHASED', playerId: player.id });
}

function applyDrawChanceCard(state: GazdalkodjOkosanState): GazdalkodjOkosanState {
  if (!canDrawChanceCard(state)) return state;
  const player = getCurrentPlayer(state);
  const space = getCurrentSpace(state);
  if (space.requiresBkvPass && !player.hasBkvPass) return state;
  if (state.chanceDeck.length === 0) return state;

  const [card, ...rest] = state.chanceDeck;
  const next: GazdalkodjOkosanState = appendLog({ ...state, chanceDeck: [...rest, card] }, { type: 'CHANCE_CARD_DRAWN', playerId: player.id, cardId: card.id });
  return applyChanceCardEffect(next, player.id, card.effect);
}

function dispatchPurchases(state: GazdalkodjOkosanState, action: GazdalkodjOkosanAction): GazdalkodjOkosanState | undefined {
  switch (action.type) {
    case 'BUY_APARTMENT':
      return applyBuyApartment(state, action.financed);
    case 'BUY_CAR':
      return applyBuyCar(state, action.financed);
    case 'BUY_FURNITURE':
      return applyBuyFurniture(state, action.item);
    case 'BUY_INSURANCE':
      return applyBuyInsurance(state, action.policy);
    case 'BUY_BKV_PASS':
      return applyBuyBkvPass(state);
    case 'DRAW_CHANCE_CARD':
      return applyDrawChanceCard(state);
    default:
      return undefined;
  }
}

export function reducer(state: GazdalkodjOkosanState, action: GazdalkodjOkosanAction): GazdalkodjOkosanState {
  if (state.status !== 'IN_PROGRESS') return state;
  return dispatchTurnAndMoney(state, action) ?? dispatchPurchases(state, action) ?? state;
}
