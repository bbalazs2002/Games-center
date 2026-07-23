import {
  canBuyLot,
  canEndTurn,
  canForfeit,
  canRollMoveDice,
  canRollNights,
  canStartConstruction,
  computeConstructionCost,
  getAuctionableLots,
  getConstructionEligibleLots,
  getCurrentPlayer,
  getLot,
  getNextBidAmount,
  getNextConstructionStep,
  getRemainingBidderIds,
  getStaircaseEligibleLots,
  ownedLotsOf,
} from './rules';
import type { BoardSpace, ConstructionPlanItem, HotelLot, HotelState, Player, PlayerId } from './state';

export function getWinner(state: HotelState): Player | null {
  if (state.status !== 'FINISHED' || !state.winnerId) return null;
  return state.players.find((p) => p.id === state.winnerId) ?? null;
}

/** null before a player's first move — they're in the parkoló (PARKING_POSITION), not on any real board space. */
export function getCurrentSpace(state: HotelState): BoardSpace | null {
  const position = getCurrentPlayer(state).position;
  return position >= 0 ? state.board[position] : null;
}

/** Lots buyable from the current player's space right now — empty unless standing on a PURCHASE space with something actually purchasable. */
export function getBuyableLots(state: HotelState): HotelLot[] {
  const space = getCurrentSpace(state);
  if (!space) return [];
  return space.adjacentLotIds.map((id) => getLot(state, id)).filter((lot) => canBuyLot(state, lot.id));
}

export function getOwnedLots(state: HotelState, playerId: string): HotelLot[] {
  return ownedLotsOf(state, playerId);
}

/** One lot's next legal construction step, and what it costs right now. */
export interface ConstructionOption {
  lotId: string;
  nextStep: ConstructionPlanItem;
  cost: number;
}

/**
 * Everything the current player could legally do right now — the single
 * place the UI (and, later, Hotel-0d's AI) reads to know what to show/pick
 * from, instead of each consumer re-deriving turnPhase/eligibility checks
 * itself. Every field here is backed by the same rules.ts predicates the
 * reducer validates incoming actions against, so this can never advertise an
 * option the reducer would then reject.
 */
export interface HotelValidActions {
  canRollMoveDice: boolean;
  buyableLots: HotelLot[];
  canStartConstruction: boolean;
  /** One entry per lot with something left to build — always that lot's very next step (buildings before garden). */
  constructionOptions: ConstructionOption[];
  canRollNights: boolean;
  canBuyStaircaseRight: boolean;
  staircaseEligibleLots: HotelLot[];
  canStartAuction: boolean;
  auctionableLots: HotelLot[];
  canBid: boolean;
  nextBidAmount: number | null;
  remainingBidderIds: PlayerId[];
  canForfeit: boolean;
  canEndTurn: boolean;
}

export function getValidActions(state: HotelState): HotelValidActions {
  const player = getCurrentPlayer(state);
  const constructionEligibleLots = getConstructionEligibleLots(state, player.id);

  return {
    canRollMoveDice: canRollMoveDice(state),
    buyableLots: getBuyableLots(state),
    canStartConstruction: canStartConstruction(state),
    constructionOptions: constructionEligibleLots.flatMap((lot): ConstructionOption[] => {
      const nextStep = getNextConstructionStep(lot, 0, false);
      return nextStep ? [{ lotId: lot.id, nextStep, cost: computeConstructionCost(lot, nextStep) }] : [];
    }),
    canRollNights: canRollNights(state),
    canBuyStaircaseRight: state.staircasePurchaseRightActive,
    staircaseEligibleLots: getStaircaseEligibleLots(state, player.id),
    canStartAuction: state.turnPhase === 'AWAITING_DEBT_RESOLUTION',
    auctionableLots: getAuctionableLots(state),
    canBid: state.turnPhase === 'AUCTION_IN_PROGRESS',
    nextBidAmount: getNextBidAmount(state),
    remainingBidderIds: getRemainingBidderIds(state),
    canForfeit: canForfeit(state),
    canEndTurn: canEndTurn(state),
  };
}
