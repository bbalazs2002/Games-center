import { WIN_CONDITION_MIN_WEALTH } from '../engine/boardConfig';
import { ALL_FURNITURE_ITEMS } from '../engine/furnitureCatalog';
import { getPlayer, hasAllFurniture, isFullyOwned, totalWealth } from '../engine/rules';
import type { GazdalkodjOkosanState, OwnershipStatus, Player, PlayerId } from '../engine/state';

// See docs/gazdalkodj-okosan-0d-ai-specifikacio.md §3.3 — starting weights,
// not fully playtested/tuned (explicitly out of scope, same as Hotel).
const BANKRUPT_PENALTY = -100_000;

// hasWon (rules.ts) requires totalWealth ONLY to be >= this trivially-low
// bar (2000, vs. 18000 starting cash) — bankruptcy can only ever happen from
// a MANDATORY payment the player's totalWealth can't cover (requestPayment
// bankrupts immediately in that case, no debt/auction mechanic exists), so
// the safety term below is keyed on totalWealth, never on cash alone — the
// bank account is exactly as spendable as cash for every payment
// (SETTLE_PAYMENT can draw from either source), so there is no "low cash but
// healthy bank balance" risk to separately penalize.
const WEALTH_SAFETY_THRESHOLD = 3000;
const WEALTH_SAFETY_MAX_PENALTY = 6000; // penalty magnitude at totalWealth === 0

function wealthSafetyPenalty(wealth: number): number {
  if (wealth >= WEALTH_SAFETY_THRESHOLD) return 0;
  const shortfallRatio = (WEALTH_SAFETY_THRESHOLD - wealth) / WEALTH_SAFETY_THRESHOLD;
  return -(shortfallRatio * shortfallRatio) * WEALTH_SAFETY_MAX_PENALTY;
}

// Ownership-completion bonuses — deliberately LARGE relative to each item's
// own price (apartment cash price 30000, car 10000, furniture max 3000,
// insurance/BKV under 200) so that buying, whenever a purchase opportunity
// is actually available and affordable, always outscores hoarding the same
// cash. This is the "ritka-alkalom bónusz" from the plan (2026-08-09 user
// request): a specific purchase-type space is rare (only a few of the 42
// board spaces offer it, dice-driven movement doesn't guarantee a return),
// so the search must never treat "buy now" and "wait for a better moment"
// as comparable options — baked in here as a per-state ownership bonus
// (Hotel's FIRST_LOTS_BONUS/UNBUILT_LOT_PORTFOLIO_FACTOR pattern) rather
// than threaded through the search as a separate action-aware term, since a
// state-level bias reaches every search depth/greedy-opponent path uniformly
// without extra plumbing.
const APARTMENT_FULL_BONUS = 35000;
const CAR_FULL_BONUS = 12000;
const FURNITURE_ITEM_BONUS = 4000; // per item — safely above the priciest single item (szobabútor, 3000)
const CAR_INSURANCE_BONUS = 5000; // required to win (hasWon), price only 100
const LIFE_INSURANCE_BONUS = 150; // optional, no win-condition requirement — modest value for fire/no-risk peace of mind
const HOME_INSURANCE_BONUS = 150;
const BKV_PASS_BONUS = 250; // unlocks space 15's extra-roll reward + space 27's chance draw, price 200

const WEALTH_THRESHOLD_MET_BONUS = 1000; // totalWealth >= WIN_CONDITION_MIN_WEALTH (rarely binding — starting cash is 9x the bar — but part of hasWon, so credited)
// A nonlinear kicker specifically for "exactly one win condition left" — the
// per-condition bonuses above already reward incremental progress linearly,
// but an imminent win deserves a disproportionate push over "merely more
// progress" (docs/gazdalkodj-okosan-0d-ai-specifikacio.md §3.3, "az UTOLSÓ
// hiányzó feltétel aránytalanul nagyot ér").
const CLOSE_TO_WIN_BONUS = 15000;

const OPPONENT_RISK_BASELINE = 3000;
const OPPONENT_RISK_WEIGHT = 0.5;

/**
 * How much of `fullBonus` a win-condition item is worth right now — 0 for
 * unowned, the full bonus for OWNED_CASH or a fully-paid-off FINANCED plan,
 * and a smooth, proportional fraction while a financed loan is still being
 * paid down. This is also what gives a financed-but-still-owing purchase
 * MORE credit than never having bought at all, even though totalWealth alone
 * (down payment spent) would otherwise look identical to "did nothing" —
 * exactly the "nettó vagyon" nuance from the plan (paid-down principal counts
 * as progress, not just eventual full payoff).
 */
function ownershipCredit(status: OwnershipStatus, fullBonus: number): number {
  if (status.kind === 'NONE') return 0;
  if (status.kind === 'OWNED_CASH') return fullBonus;
  const { totalPrice, remainingBalance } = status.plan;
  if (remainingBalance <= 0) return fullBonus;
  return fullBonus * ((totalPrice - remainingBalance) / totalPrice);
}

function winConditionsMet(player: Player): number {
  let count = 0;
  if (isFullyOwned(player.apartment)) count += 1;
  if (isFullyOwned(player.car)) count += 1;
  if (hasAllFurniture(player)) count += 1;
  if (player.insurance.car) count += 1;
  if (totalWealth(player) >= WIN_CONDITION_MIN_WEALTH) count += 1;
  return count;
}

/** Win-condition/ownership component of the score — split out purely to stay under the project's ESLint complexity limit, same reasoning as the reducer's own dispatch-table splits elsewhere in this codebase. */
function ownershipScore(me: Player): number {
  let score = ownershipCredit(me.apartment, APARTMENT_FULL_BONUS) + ownershipCredit(me.car, CAR_FULL_BONUS);
  for (const item of ALL_FURNITURE_ITEMS) {
    if (me.furniture[item]) score += FURNITURE_ITEM_BONUS;
  }
  if (me.insurance.car) score += CAR_INSURANCE_BONUS;
  if (me.insurance.life) score += LIFE_INSURANCE_BONUS;
  if (me.insurance.home) score += HOME_INSURANCE_BONUS;
  if (me.hasBkvPass) score += BKV_PASS_BONUS;
  if (winConditionsMet(me) === 4) score += CLOSE_TO_WIN_BONUS;
  return score;
}

/**
 * "How good is this state for `forPlayerId`" — dominated by win-condition
 * completion progress (see docs/gazdalkodj-okosan-0d-ai-specifikacio.md
 * §3.3), plus net wealth and a bankruptcy-safety term. Used both as the
 * expectimax leaf evaluation and as the one-ply greedy policy that stands in
 * for every non-root actor during self-play (see expectimax.ts).
 */
export function evaluateState(state: GazdalkodjOkosanState, forPlayerId: PlayerId): number {
  const me = getPlayer(state, forPlayerId);
  if (me.bankrupt) return BANKRUPT_PENALTY;

  const wealth = totalWealth(me);
  let score = wealth + wealthSafetyPenalty(wealth) + ownershipScore(me);
  if (wealth >= WIN_CONDITION_MIN_WEALTH) score += WEALTH_THRESHOLD_MET_BONUS;

  for (const opponent of state.players) {
    if (opponent.id === forPlayerId || opponent.bankrupt) continue;
    const risk = Math.max(0, OPPONENT_RISK_BASELINE - totalWealth(opponent));
    score += risk * OPPONENT_RISK_WEIGHT;
  }

  return score;
}
