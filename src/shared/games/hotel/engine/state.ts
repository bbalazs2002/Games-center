export type PlayerId = string;

/** Configuration for one of the 8 named hotels — see docs/hotel-0a-specifikacio.md §2. */
export interface HotelConfig {
  id: string;
  name: string;
  lotPrice: number;
  staircasePrice: number;
  /** Sequential — buildings can only be built in this order. */
  buildingPrices: number[];
  gardenPrice: number;
  /** nightlyRates[buildingsBuilt - 1][nights - 1] */
  nightlyRates: number[][];
  /** The "+ kert" row — a separate top tariff tier, not indexed by buildingsBuilt. */
  gardenNightlyRates: number[];
}

export interface HotelLot extends HotelConfig {
  /** null = the bank owns it (every lot starts this way). */
  ownerId: PlayerId | null;
  buildingsBuilt: number;
  hasGarden: boolean;
  /**
   * Price the bank paid for this lot at its last auction/forfeit — takes
   * precedence over lotPrice when buying it back from the bank. null if it
   * has never been auctioned.
   */
  bankBuybackPrice: number | null;
}

export type SpaceType = 'START' | 'PURCHASE' | 'CONSTRUCTION' | 'FREE_STAIRCASE' | 'FREE_BUILDING';

export interface BoardSpace {
  id: string;
  type: SpaceType;
  /**
   * Which lot(s) are physically next to this space. Functionally restricts
   * PURCHASE (only these lots can be bought here) and staircase placement
   * eligibility. Does NOT restrict CONSTRUCTION/FREE_STAIRCASE/FREE_BUILDING
   * — a player may always act on any lot they own from those space types.
   */
  adjacentLotIds: string[];
  /** At most one staircase per space, regardless of adjacentLotIds.length. */
  staircaseForLotId: string | null;
}

export interface SpecialLane {
  /** Sits between board[afterSpaceIndex] and the next space — triggers when crossed while moving, not when landed on. */
  afterSpaceIndex: number;
  effect: 'BONUS_2000' | 'STAIRCASE_PURCHASE_RIGHT';
}

/**
 * The physical board has a "parkoló" (parking lot) next to Start where every
 * player's token actually begins — it is NOT one of the 31 counted loop
 * spaces and is never revisited once a player makes their first move (see
 * docs/hotel-0a-specifikacio.md §9.2). Modeled as position -1: one step
 * before board index 0, so the existing "+1 per step" movement math already
 * places a first roll correctly without special-casing.
 */
export const PARKING_POSITION = -1;

export interface Player {
  id: PlayerId;
  name: string;
  cash: number;
  /** PARKING_POSITION before the player's first move, otherwise an index into `board`. */
  position: number;
  bankrupt: boolean;
}

/**
 * A Hotel turn has several phases (unlike Dáma's single MOVE-per-turn) — see
 * docs/hotel-0a-specifikacio.md §3.
 */
export type TurnPhase =
  | 'AWAITING_ROLL'
  | 'AWAITING_NIGHTS_ROLL'
  | 'RESOLVING_SPACE'
  | 'AWAITING_BUILDING_PERMIT'
  | 'AWAITING_DEBT_RESOLUTION'
  | 'AUCTION_IN_PROGRESS'
  /** Landed on FREE_STAIRCASE, owns at least one lot with room for one — waiting on the player to pick which lot/space (docs/hotel-0a-specifikacio.md §9.2). */
  | 'AWAITING_FREE_STAIRCASE_CHOICE'
  | 'TURN_COMPLETE';

export type BuildingPermitResult = 'GREEN' | 'FREE' | 'DOUBLE' | 'RED';

export interface ConstructionPlanItem {
  lotId: string;
  /** How many NEW buildings to add (not the resulting total). */
  buildingCount: number;
  buildGarden?: boolean;
}

export interface PendingAuction {
  lotId: string;
  /** The player whose debt/forfeit triggered this auction — excluded from bidding. */
  auctioneerId: PlayerId;
  highestBid: number;
  highestBidderId: PlayerId | null;
  passedPlayerIds: PlayerId[];
}

/** Debt owed after a payment (rent, double-price construction) exceeded the payer's cash. */
export interface PendingDebt {
  amount: number;
  /** Who receives the payment once resolved — null when it's owed to the bank (e.g. construction costs). */
  creditorId: PlayerId | null;
}

export type HotelStatus = 'IN_PROGRESS' | 'FINISHED';

/**
 * One structured record per notable event — movement, money, and property
 * changes — appended by the reducer as it applies actions (docs/hotel-0a-specifikacio.md
 * §9.2, "log panel" request). Deliberately structured data, not pre-formatted
 * text: the engine stays UI/language-agnostic (same principle as
 * BuildingPermitResult), a client-side formatter turns each entry into a
 * Hungarian sentence, resolving player/lot names from the current state at
 * render time. `log` only ever grows (append-only), so its array index is a
 * stable React key.
 */
export type LogEntry =
  | { type: 'MOVED'; playerId: PlayerId; roll: number; toPosition: number }
  | { type: 'BONUS_2000'; playerId: PlayerId }
  | { type: 'STAIRCASE_RIGHT_ACTIVATED'; playerId: PlayerId }
  | { type: 'LOT_BOUGHT'; playerId: PlayerId; lotId: string; price: number }
  | {
      type: 'CONSTRUCTION_PERMIT_ROLLED';
      playerId: PlayerId;
      result: BuildingPermitResult;
      plan: ConstructionPlanItem[];
      totalCost: number;
    }
  | { type: 'NIGHTS_STAY'; playerId: PlayerId; lotId: string; nights: number; rentAmount: number; toPlayerId: PlayerId | null }
  /**
   * FREE_STAIRCASE/FREE_BUILDING are bonus spaces — either the player gets
   * the physical staircase/building placed for free (lotId set, payout 0),
   * or when that's not possible (no eligible lot/room) the BANK pays them
   * cash instead (lotId null, payout > 0). Never a fee paid BY the player.
   */
  | { type: 'FREE_STAIRCASE_GRANTED'; playerId: PlayerId; lotId: string | null; payoutReceived: number }
  | { type: 'FREE_BUILDING_GRANTED'; playerId: PlayerId; lotId: string | null; payoutReceived: number }
  | { type: 'STAIRCASE_RIGHT_BOUGHT'; playerId: PlayerId; lotId: string; price: number }
  | { type: 'AUCTION_STARTED'; playerId: PlayerId; lotId: string; openingBid: number }
  | { type: 'BID_PLACED'; playerId: PlayerId; lotId: string; amount: number }
  | { type: 'BID_PASSED'; playerId: PlayerId; lotId: string }
  | { type: 'AUCTION_RESOLVED'; lotId: string; winnerId: PlayerId | null; amount: number }
  | { type: 'FORFEITED'; playerId: PlayerId }
  | { type: 'GAME_WON'; playerId: PlayerId };

export interface HotelState {
  board: BoardSpace[];
  specialLanes: SpecialLane[];
  lots: HotelLot[];
  players: Player[];
  currentPlayerIndex: number;
  turnPhase: TurnPhase;
  /** Kept separately (not one shared "last roll" field) so the UI can show each die's own value at once, undisturbed by the others. */
  lastMoveRoll: number | null;
  lastNightsRoll: number | null;
  pendingConstructionPlan: ConstructionPlanItem[] | null;
  lastBuildingPermitRoll: BuildingPermitResult | null;
  /** Set once a RED building-permit roll blocks further construction for the rest of this turn. */
  constructionLockedThisTurn: boolean;
  pendingNightsRollLotId: string | null;
  pendingDebt: PendingDebt | null;
  pendingAuction: PendingAuction | null;
  /** True only during the turn a player crosses the "staircase purchase right" special lane. */
  staircasePurchaseRightActive: boolean;
  /** Lot ids already used for a paid staircase purchase this turn — max 1/hotel/turn. */
  lotsWithStaircasePurchasedThisTurn: string[];
  status: HotelStatus;
  /** Only set once status is FINISHED — the last non-bankrupt player. */
  winnerId: PlayerId | null;
  /** Append-only event history for the game-log panel — see LogEntry. */
  log: LogEntry[];
}
