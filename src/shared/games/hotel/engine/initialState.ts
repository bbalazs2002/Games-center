import { BOARD_SPACES, HOTEL_CONFIGS, SPECIAL_LANES } from './hotelConfigs';
import { PARKING_POSITION, type HotelLot, type HotelState, type Player } from './state';

/** Confirmed — docs/hotel-0a-specifikacio.md §2. */
const STARTING_CASH = 15000;

export function createInitialState(playerNames: string[]): HotelState {
  const players: Player[] = playerNames.map((name, index) => ({
    id: `player-${index + 1}`,
    name,
    cash: STARTING_CASH,
    position: PARKING_POSITION,
    bankrupt: false,
  }));

  const lots: HotelLot[] = HOTEL_CONFIGS.map((config) => ({
    ...config,
    ownerId: null,
    buildingsBuilt: 0,
    hasGarden: false,
    bankBuybackPrice: null,
  }));

  return {
    board: BOARD_SPACES.map((space) => ({ ...space })),
    specialLanes: SPECIAL_LANES,
    lots,
    players,
    currentPlayerIndex: 0,
    turnPhase: 'AWAITING_ROLL',
    lastMoveRoll: null,
    lastNightsRoll: null,
    pendingConstructionPlan: null,
    lastBuildingPermitRoll: null,
    constructionLockedThisTurn: false,
    pendingNightsRollLotId: null,
    pendingDebt: null,
    pendingAuction: null,
    staircasePurchaseRightActive: false,
    lotsWithStaircasePurchasedThisTurn: [],
    lotsBoughtThisTurn: [],
    status: 'IN_PROGRESS',
    winnerId: null,
    log: [],
  };
}
