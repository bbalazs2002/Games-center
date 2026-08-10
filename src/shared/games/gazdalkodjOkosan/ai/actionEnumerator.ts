import type { GazdalkodjOkosanAction } from '../engine/actions';
import { canAckChanceCard, canPayInstallment, canSettlePayment, getPlayer } from '../engine/rules';
import { getValidActions } from '../engine/selectors';
import type { GazdalkodjOkosanState, Player, PlayerId } from '../engine/state';

/** Chance-node phase — exactly one action TYPE is legal (`ROLL_MOVE_DICE`), but its `value` is random, not chosen. See docs/gazdalkodj-okosan-0d-ai-specifikacio.md §3.2. */
export function isChanceNodePhase(state: GazdalkodjOkosanState): boolean {
  return state.turnPhase === 'AWAITING_ROLL';
}

export interface ChanceOutcome {
  action: GazdalkodjOkosanAction;
  probability: number;
}

/** Uniform 1-6 — the ONLY real chance node in this engine (chance-card draws are a deterministic cyclic queue fully visible in state.chanceDeck, unlike Hotel's shuffled/random draws). */
export function chanceOutcomes(): ChanceOutcome[] {
  return [1, 2, 3, 4, 5, 6].map((value) => ({ action: { type: 'ROLL_MOVE_DICE', value }, probability: 1 / 6 }));
}

/**
 * At most 2 candidates per pending loan: the minimum required payment, and —
 * only if it's actually a different, affordable amount — paying the whole
 * remaining balance off in one go (early payoff). Both are real, distinct
 * long-term decisions, so both are searched rather than canonicalized to one
 * (see docs/gazdalkodj-okosan-0d-ai-specifikacio.md §3.2).
 */
function installmentCandidates(state: GazdalkodjOkosanState, loan: 'car' | 'apartment', player: Player): GazdalkodjOkosanAction[] {
  if (!canPayInstallment(state, loan)) return [];
  const status = loan === 'car' ? player.car : player.apartment;
  if (status.kind !== 'FINANCED') return [];
  const { perTurnPayment, remainingBalance } = status.plan;
  const minimum = Math.min(perTurnPayment, remainingBalance);

  const minimumAction: GazdalkodjOkosanAction = loan === 'car' ? { type: 'PAY_CAR_INSTALLMENT' } : { type: 'PAY_APARTMENT_INSTALLMENT' };
  const actions = [minimumAction];

  if (remainingBalance > minimum && player.cash + (player.bankAccount?.balance ?? 0) >= remainingBalance) {
    actions.push(
      loan === 'car' ? { type: 'PAY_CAR_INSTALLMENT', amount: remainingBalance } : { type: 'PAY_APARTMENT_INSTALLMENT', amount: remainingBalance },
    );
  }
  return actions;
}

/**
 * Cash-first, bank-as-fallback split — the only candidate offered for
 * SETTLE_PAYMENT (not searched as a continuous decision, see §3.2). Always
 * produces a valid split: AWAITING_PAYMENT is only ever reached when the
 * player's totalWealth already covers the amount (requestPayment bankrupts
 * immediately otherwise for non-BUY_* reasons; the canBuy-family and
 * canAfford-family predicates gate BUY_* reasons the same way before the
 * payment is ever requested).
 */
export function decidePaymentSplit(player: Player, amount: number): { cashAmount: number; bankAmount: number } {
  const cashAmount = Math.min(player.cash, amount);
  return { cashAmount, bankAmount: amount - cashAmount };
}

function paymentActions(state: GazdalkodjOkosanState, actorId: PlayerId): GazdalkodjOkosanAction[] {
  if (!canSettlePayment(state) || !state.pendingPayment) return [];
  const { cashAmount, bankAmount } = decidePaymentSplit(getPlayer(state, actorId), state.pendingPayment.amount);
  return [{ type: 'SETTLE_PAYMENT', cashAmount, bankAmount }];
}

/** Every purchase candidate (apartment/car/furniture/insurance/BKV pass) legal for the current landing — split out purely to stay under the project's ESLint complexity limit, same reasoning as the reducer's own dispatch-table splits elsewhere in this codebase. */
function purchaseActions(valid: ReturnType<typeof getValidActions>): GazdalkodjOkosanAction[] {
  const actions: GazdalkodjOkosanAction[] = [];
  if (valid.canBuyApartment.cash) actions.push({ type: 'BUY_APARTMENT', financed: false });
  if (valid.canBuyApartment.financed) actions.push({ type: 'BUY_APARTMENT', financed: true });
  if (valid.canBuyCar.cash) actions.push({ type: 'BUY_CAR', financed: false });
  if (valid.canBuyCar.financed) actions.push({ type: 'BUY_CAR', financed: true });
  for (const item of valid.buyableFurniture) actions.push({ type: 'BUY_FURNITURE', item });
  for (const policy of valid.buyableInsurancePolicies) actions.push({ type: 'BUY_INSURANCE', policy });
  if (valid.canBuyBkvPass) actions.push({ type: 'BUY_BKV_PASS' });
  return actions;
}

/**
 * The "free decision" phase — every optional purchase/service action legal
 * for the current landing, built entirely from selectors.ts's
 * getValidActions (so this can never suggest something the reducer would
 * reject). WITHDRAW_FROM_ACCOUNT is deliberately never offered here (see
 * §3.2) — SETTLE_PAYMENT's own split already reaches the bank account
 * directly, so a standalone withdrawal has no purpose for a purely
 * mechanical decision-maker. DEPOSIT_TO_ACCOUNT always deposits the FULL
 * cash balance (2026-08-09 user decision) — the bank is exactly as liquid as
 * cash for every payment, so holding cash back "just in case" gains nothing
 * and only forgoes 7% interest.
 */
function resolvingSpaceActions(state: GazdalkodjOkosanState, actorId: PlayerId): GazdalkodjOkosanAction[] {
  const player = getPlayer(state, actorId);
  const valid = getValidActions(state); // assumes actorId is the current turn-holder — always true, no out-of-turn actor in this engine
  const actions = purchaseActions(valid);

  if (valid.canOpenBankAccount) actions.push({ type: 'OPEN_BANK_ACCOUNT' });
  if (valid.canDeposit) actions.push({ type: 'DEPOSIT_TO_ACCOUNT', amount: player.cash });
  if (valid.canDrawChanceCard) actions.push({ type: 'DRAW_CHANCE_CARD' });
  if (valid.canEndTurn) actions.push({ type: 'END_TURN' });

  return actions;
}

/**
 * Every concrete action `actorId` could legally take right now — never
 * called for AWAITING_ROLL (see isChanceNodePhase) or TURN_COMPLETE. Mirrors
 * rules.ts/selectors.ts exactly, so this can't produce an action the reducer
 * would reject (same guarantee as every other game's AI in this codebase).
 */
export function enumerateCandidateActions(state: GazdalkodjOkosanState, actorId: PlayerId): GazdalkodjOkosanAction[] {
  switch (state.turnPhase) {
    case 'AWAITING_MANDATORY_INSTALLMENT': {
      const player = getPlayer(state, actorId);
      return [...installmentCandidates(state, 'car', player), ...installmentCandidates(state, 'apartment', player)];
    }
    case 'AWAITING_CHANCE_CARD_ACK':
      return canAckChanceCard(state) ? [{ type: 'ACK_CHANCE_CARD' }] : [];
    case 'AWAITING_PAYMENT':
      return paymentActions(state, actorId);
    case 'RESOLVING_SPACE':
      return resolvingSpaceActions(state, actorId);
    default:
      return [];
  }
}
