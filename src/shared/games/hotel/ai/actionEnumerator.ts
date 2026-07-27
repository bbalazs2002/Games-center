import type { HotelAction } from '../engine/actions';
import {
  canBuildWithoutPermit,
  canPassBid,
  canPlaceBid,
  getNextBidAmount,
  getRemainingBidderIds,
  getStaircaseSpaceOptions,
} from '../engine/rules';
import { getValidActions, type HotelValidActions } from '../engine/selectors';
import type { HotelState, PlayerId } from '../engine/state';

/** Chance-node phases — exactly one action TYPE is legal, but its `value` is random, not chosen. See docs/hotel-0d-ai-specifikacio.md §4.2. */
export function isChanceNodePhase(state: HotelState): boolean {
  return (
    state.turnPhase === 'AWAITING_ROLL' ||
    state.turnPhase === 'AWAITING_NIGHTS_ROLL' ||
    state.turnPhase === 'AWAITING_BUILDING_PERMIT'
  );
}

export interface ChanceOutcome {
  action: HotelAction;
  probability: number;
}

/** Same weighting as src/server/games/hotel/dice.ts, expressed as an explicit probability distribution for the search's expectation sum instead of a single sampled draw. */
export function chanceOutcomes(state: HotelState): ChanceOutcome[] {
  if (state.turnPhase === 'AWAITING_BUILDING_PERMIT') {
    return [
      { action: { type: 'ROLL_BUILDING_PERMIT', value: 'GREEN' }, probability: 3 / 6 },
      { action: { type: 'ROLL_BUILDING_PERMIT', value: 'FREE' }, probability: 1 / 6 },
      { action: { type: 'ROLL_BUILDING_PERMIT', value: 'DOUBLE' }, probability: 1 / 6 },
      { action: { type: 'ROLL_BUILDING_PERMIT', value: 'RED' }, probability: 1 / 6 },
    ];
  }
  const type = state.turnPhase === 'AWAITING_ROLL' ? 'ROLL_MOVE_DICE' : 'ROLL_NIGHTS';
  return [1, 2, 3, 4, 5, 6].map((value) => ({ action: { type, value } as HotelAction, probability: 1 / 6 }));
}

/**
 * Who gets to act next — the current turn-holder, except during an auction,
 * where any remaining (non-passed) bidder may act. Real multiplayer bidding
 * is order-free (whoever's client sends first), but the search needs a
 * single deterministic actor per node — picking the first remaining bidder
 * is an arbitrary but consistent choice for internal simulation purposes
 * only (it doesn't affect what the ROOM actually accepts from real clients).
 */
export function getActingId(state: HotelState): PlayerId | null {
  if (state.turnPhase === 'AUCTION_IN_PROGRESS') {
    return getRemainingBidderIds(state)[0] ?? null;
  }
  return state.players[state.currentPlayerIndex]?.id ?? null;
}

function enumerateAuctionActions(state: HotelState, actorId: PlayerId): HotelAction[] {
  const actions: HotelAction[] = [];
  if (canPassBid(state, actorId)) actions.push({ type: 'PASS_BID', bidderId: actorId });
  const nextBid = getNextBidAmount(state);
  if (nextBid !== null && canPlaceBid(state, actorId, nextBid)) {
    actions.push({ type: 'PLACE_BID', bidderId: actorId, amount: nextBid });
  }
  return actions;
}

// NOTE: valid.constructionOptions lists every owned lot with something left
// to build regardless of turnPhase/space (selectors.ts deliberately
// decouples "what WOULD you build" from "can you build right now" — the UI
// gates on canStartConstruction itself before using this list). Must gate
// here too: without it, a hypothetically-just-bought lot on a
// non-CONSTRUCTION space would look like a legal construction candidate, the
// reducer would then silently no-op it (applyStartConstruction's own
// canStartConstruction guard fails), and the search would recurse forever on
// an unchanged state.
function propertyActions(state: HotelState, valid: HotelValidActions, actorId: PlayerId): HotelAction[] {
  const actions: HotelAction[] = [];

  for (const lot of valid.buyableLots) actions.push({ type: 'BUY_LOT', lotId: lot.id });

  if (valid.canStartConstruction) {
    for (const option of valid.constructionOptions) {
      const plan = [option.nextStep];
      actions.push(
        canBuildWithoutPermit(state, actorId, plan)
          ? { type: 'BUILD_WITHOUT_PERMIT', plan }
          : { type: 'START_CONSTRUCTION', plan },
      );
    }
  }

  for (const lot of valid.staircaseEligibleLots) {
    for (const space of getStaircaseSpaceOptions(state, lot.id)) {
      actions.push({ type: 'BUY_STAIRCASE_RIGHT', lotId: lot.id, spaceId: space.id });
    }
  }

  return actions;
}

function turnFlowActions(valid: HotelValidActions): HotelAction[] {
  const actions: HotelAction[] = [];

  if (valid.canChooseFreeStaircaseSpace) {
    for (const candidate of valid.freeStaircaseCandidates) {
      actions.push({ type: 'CHOOSE_FREE_STAIRCASE_SPACE', lotId: candidate.lotId, spaceId: candidate.spaceId });
    }
  }

  if (valid.canStartAuction) {
    for (const lot of valid.auctionableLots) actions.push({ type: 'START_AUCTION', lotId: lot.id });
  }

  if (valid.canEndTurn) actions.push({ type: 'END_TURN' });
  // Always last, and never excluded — expectimax naturally avoids it via the
  // heuristic's harsh self-bankruptcy penalty, no hand-coded special case
  // needed (see docs/hotel-0d-ai-specifikacio.md §4.2).
  if (valid.canForfeit) actions.push({ type: 'FORFEIT' });

  return actions;
}

/**
 * Every concrete action `actorId` could legally take right now — never
 * called for a chance-node phase (see isChanceNodePhase). Mirrors the
 * getValidActions/rules.ts predicates exactly, so this can't produce an
 * action the reducer would reject (same guarantee as Dáma's random
 * strategy — see docs/hotel-0d-ai-specifikacio.md §4.1). Split into several
 * small per-action-family helpers purely to stay under the project's ESLint
 * complexity limit — same reasoning as the reducer's dispatch-table splits
 * elsewhere in this codebase.
 */
export function enumerateCandidateActions(state: HotelState, actorId: PlayerId): HotelAction[] {
  if (state.turnPhase === 'AUCTION_IN_PROGRESS') return enumerateAuctionActions(state, actorId);

  const valid = getValidActions(state); // assumes actorId is the current turn-holder — true for every non-auction phase
  return [...propertyActions(state, valid, actorId), ...turnFlowActions(valid)];
}
