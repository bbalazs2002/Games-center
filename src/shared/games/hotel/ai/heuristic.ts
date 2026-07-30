import { computeHotelValue, computeNightlyRent, getPlayer, ownedLotsOf } from '../engine/rules';
import type { HotelLot, HotelState, PlayerId } from '../engine/state';

// See docs/hotel-0d-ai-specifikacio.md §4.3/§8 — starting weights, not fully
// playtested/tuned; adjusted once (see cashSafetyPenalty below) after
// simulateHotelGame batches showed HARD (which looks furthest ahead) going
// bankrupt far more often than EASY.
const BANKRUPT_PENALTY = -100_000;
const PORTFOLIO_WEIGHT = 1;
const RENT_POTENTIAL_WEIGHT = 3;
const OPPONENT_RISK_BASELINE = 3000;
const OPPONENT_RISK_WEIGHT = 0.5;
// A hard bankruptcy cliff alone doesn't discourage spending DOWN to
// near-zero cash before actually hitting it — plain expectimax maximizes
// EXPECTED heuristic value, and portfolio/rent investment already looks
// attractive on its own, so nothing pushed back against over-extension. The
// deeper a search looks, the more aggressively it chased that nominal value,
// which is exactly why HARD went bankrupt more than EASY in testing. This
// makes low cash increasingly costly BEFORE the cliff — quadratic so it
// stays mild near the threshold but sharpens close to zero, encouraging a
// safety buffer without hard-capping how much can be spent.
// Raised from 2500/6000 (2026-07-30 playtest: "az AI játékosok viszonylag
// kevés pénz tartalékot tartanak, ezért sokszor előfordul, hogy
// árverezniük kell") — a real Hotel game bankrupts you into an auction the
// moment you can't cover a debt, so the old threshold left too little
// buffer against an unlucky rent charge landing right after a big spend.
const CASH_SAFETY_THRESHOLD = 4000;
const CASH_SAFETY_MAX_PENALTY = 8000; // penalty magnitude at cash === 0

function cashSafetyPenalty(cash: number): number {
  if (cash >= CASH_SAFETY_THRESHOLD) return 0;
  const shortfallRatio = (CASH_SAFETY_THRESHOLD - cash) / CASH_SAFETY_THRESHOLD;
  return -(shortfallRatio * shortfallRatio) * CASH_SAFETY_MAX_PENALTY;
}

// An unbuilt lot (no buildings, no garden) can be bought away by ANY
// opponent who lands on the right space, at half its lot price — reducer.ts
// pays that half-price TO the previous owner (applyBuyLot; this was a real
// bug until it got fixed alongside this heuristic — force-buying is a
// purchase FROM that player, not the bank, per docs/hotel-0a-specifikacio.md:
// "Ha a telek üres, de egy játékos már megvette, akkor féláron lehet tőle
// megvenni"). So the real downside of holding an unbuilt lot is losing HALF
// its value, not all of it — still a real risk worth discounting a little
// (a simulateHotelGame trace showed MEDIUM over-buying unbuilt lots early
// and losing some this way), just not as harshly as when the payout bug made
// it look like a total loss. Once ANYTHING is built (or a garden), the lot
// is safe from this rule and gets full credit again.
const UNBUILT_LOT_PORTFOLIO_FACTOR = 0.65;

// UNBUILT_LOT_PORTFOLIO_FACTOR alone makes buying ANY unbuilt lot score as a
// guaranteed loss in the one-ply (EASY) evaluation — the lot's price is paid
// in full but only 65% of it comes back as portfolio credit, and rent
// potential stays 0 until a LATER turn's construction (impossible within the
// same turn: buying only ever happens on a PURCHASE space, building only on
// a CONSTRUCTION space — see rules.ts's canStartConstruction). Nothing in
// the heuristic ever credited the real strategic value of simply HAVING a
// lot to build on later, so an AI already holding nothing kept finding
// END_TURN scored higher than buying — confirmed as a real playtest
// complaint (2026-07-29): "Az AI vásárolhatna és építkezhetne kicsit
// agresszívebben főleg, ha még egyáltalán nincs hotele." Tapered by how many
// lots the player already owns (steep for the first, gone by the third) so
// this only nudges an empty-handed AI toward its FIRST foothold, without
// distorting later, already-invested portfolio decisions where the plain
// cash/rent math (already well-tuned, see UNBUILT_LOT_PORTFOLIO_FACTOR's own
// history above) should keep deciding things on its own.
//
// Only the FIRST lot gets this nudge (2026-07-30 playtest: "csak a
// legelső telek megvásárlása legyen kiemelt jelentőségű, nem kell, hogy
// mindent felvásároljon azonnal") — a second/third bonus on top of the
// already-well-tuned cash/rent math was pushing the AI to keep buying
// lots for their own sake rather than developing/staircasing what it
// already has.
const FIRST_LOTS_BONUS = [1300] as const;

function firstLotsBonus(ownedLotCount: number): number {
  let bonus = 0;
  for (let i = 0; i < ownedLotCount && i < FIRST_LOTS_BONUS.length; i += 1) bonus += FIRST_LOTS_BONUS[i];
  return bonus;
}

function portfolioCredit(lot: HotelLot): number {
  const value = computeHotelValue(lot);
  const isUnbuilt = lot.buildingsBuilt === 0 && !lot.hasGarden;
  return isUnbuilt ? value * UNBUILT_LOT_PORTFOLIO_FACTOR : value;
}

/**
 * A built lot with NO staircase anywhere on the board can't yet actually
 * charge rent — the reducer only ever prompts a nights-roll (and therefore
 * only ever collects money) when a player lands on a space with
 * `staircaseForLotId` set for that lot (see reducer.ts's
 * `staircaseLotWithPossibleRent`), never just from owning/building on the
 * lot itself. The ORIGINAL `estimateRentPotential` didn't know this — it
 * credited the same hypothetical rent whether or not a staircase actually
 * existed, so the heuristic never specifically rewarded GETTING one, even
 * though it's what turns a built hotel into real income (2026-07-30
 * playtest: "Ez a játékban a legfontosabb bevételi forrás, ehhez mérten a
 * heurisztika jutalmazza ezt a döntést"). A first attempt zeroed this out
 * entirely without a staircase — confirmed via a real simulation batch to
 * regress the difficulty ladder badly (HARD's deeper search lost the
 * gradient that made continuing to invest look good at all pre-staircase,
 * and started losing to EASY/MEDIUM, sometimes going bankrupt outright).
 * A partial discount instead of a hard cliff keeps that gradient — building
 * still visibly helps before a staircase exists, just less than once one is
 * in place, which is what actually makes GETTING one look like an
 * improvement rather than a `0 -> anything` step-change.
 */
const NO_STAIRCASE_RENT_FACTOR = 0.35;

/** Average nightly rent across all 6 possible roll outcomes, at the lot's CURRENT build state — a proxy for "how much would landing here cost someone," discounted if there's no staircase yet to actually collect it through (see NO_STAIRCASE_RENT_FACTOR's own note). */
function estimateRentPotential(state: HotelState, lot: HotelLot): number {
  if (lot.buildingsBuilt === 0 && !lot.hasGarden) return 0;
  let total = 0;
  for (let nights = 1; nights <= 6; nights += 1) {
    total += computeNightlyRent(lot, nights);
  }
  const average = total / 6;
  return hasStaircase(state, lot.id) ? average : average * NO_STAIRCASE_RENT_FACTOR;
}

function hasStaircase(state: HotelState, lotId: string): boolean {
  return state.board.some((space) => space.staircaseForLotId === lotId);
}

function opponentNetWorth(state: HotelState, opponentId: PlayerId): number {
  const cash = getPlayer(state, opponentId).cash;
  const portfolio = ownedLotsOf(state, opponentId).reduce((sum, lot) => sum + portfolioCredit(lot), 0);
  return cash + portfolio;
}

/**
 * "How good is this state for `forPlayerId`" — cash + owned portfolio value +
 * future rent potential + how close opponents are to bankruptcy (see
 * docs/hotel-0d-ai-specifikacio.md §4.3). Used both as the expectimax leaf
 * evaluation and as the one-ply greedy policy that stands in for every
 * non-root actor during self-play (see expectimax.ts).
 */
export function evaluateState(state: HotelState, forPlayerId: PlayerId): number {
  const me = getPlayer(state, forPlayerId);
  if (me.bankrupt) return BANKRUPT_PENALTY;

  const ownedLots = ownedLotsOf(state, forPlayerId);
  let score = me.cash + cashSafetyPenalty(me.cash) + firstLotsBonus(ownedLots.length);
  for (const lot of ownedLots) {
    score += portfolioCredit(lot) * PORTFOLIO_WEIGHT;
    score += estimateRentPotential(state, lot) * RENT_POTENTIAL_WEIGHT;
  }

  for (const opponent of state.players) {
    if (opponent.id === forPlayerId || opponent.bankrupt) continue;
    const risk = Math.max(0, OPPONENT_RISK_BASELINE - opponentNetWorth(state, opponent.id));
    score += risk * OPPONENT_RISK_WEIGHT;
  }

  return score;
}
