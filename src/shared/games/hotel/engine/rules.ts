import type {
  BoardSpace,
  ConstructionPlanItem,
  HotelLot,
  HotelState,
  LogEntry,
  Player,
  PlayerId,
  SpecialLane,
} from './state';

export function getPlayer(state: HotelState, playerId: PlayerId): Player {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  return player;
}

export function getCurrentPlayer(state: HotelState): Player {
  return state.players[state.currentPlayerIndex];
}

export function updatePlayer(state: HotelState, playerId: PlayerId, patch: Partial<Player>): HotelState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)) };
}

export function getLot(state: HotelState, lotId: string): HotelLot {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot) throw new Error(`Unknown lot: ${lotId}`);
  return lot;
}

export function updateLot(state: HotelState, lotId: string, patch: Partial<HotelLot>): HotelState {
  return { ...state, lots: state.lots.map((l) => (l.id === lotId ? { ...l, ...patch } : l)) };
}

export function updateSpace(state: HotelState, spaceId: string, patch: Partial<BoardSpace>): HotelState {
  return { ...state, board: state.board.map((s) => (s.id === spaceId ? { ...s, ...patch } : s)) };
}

/** Appends one event to the game log — see LogEntry. Log is append-only, so its index is a stable React key. */
export function appendLog(state: HotelState, entry: LogEntry): HotelState {
  return { ...state, log: [...state.log, entry] };
}

export function ownedLotsOf(state: HotelState, playerId: PlayerId): HotelLot[] {
  return state.lots.filter((l) => l.ownerId === playerId);
}

/** Skips bankrupt players — see docs/hotel-0a-specifikacio.md §4. */
export function nextActivePlayerIndex(state: HotelState): number {
  const total = state.players.length;
  let index = state.currentPlayerIndex;
  for (let i = 0; i < total; i += 1) {
    index = (index + 1) % total;
    if (!state.players[index].bankrupt) return index;
  }
  return state.currentPlayerIndex;
}

export function activePlayerCount(state: HotelState): number {
  return state.players.filter((p) => !p.bankrupt).length;
}

/** Special lanes trigger when the move path crosses `afterSpaceIndex` -> next space, wraparound-safe. */
export function crossedLanes(
  fromPosition: number,
  steps: number,
  boardLength: number,
  lanes: SpecialLane[],
): SpecialLane[] {
  const traversedFromIndexes = Array.from({ length: steps }, (_, i) => (fromPosition + i) % boardLength);
  return lanes.filter((lane) => traversedFromIndexes.includes(lane.afterSpaceIndex));
}

/**
 * At most one (non-bankrupt) player may stand on a space at a time —
 * docs/hotel-0a-specifikacio.md §2, confirmed rule not in the original
 * written rules. No exemption for Start: every player actually begins on
 * the separate, off-loop "parkoló" (PARKING_POSITION), so Start is a normal
 * space like any other by the time anyone could land on it.
 */
function isOccupiedByOtherPlayer(state: HotelState, position: number, movingPlayerId: PlayerId): boolean {
  return state.players.some((p) => p.id !== movingPlayerId && !p.bankrupt && p.position === position);
}

/**
 * Applies the dice roll, then keeps pushing forward one space at a time past
 * any occupied space until landing on a free one — see docs/hotel-0a-specifikacio.md
 * §2. `totalSteps` (dice roll + any extra push) is what crossedLanes needs,
 * since a special lane crossed only during the "push past" part still counts.
 */
export function resolveLandingPosition(
  state: HotelState,
  fromPosition: number,
  diceValue: number,
  movingPlayerId: PlayerId,
): { position: number; totalSteps: number } {
  const boardLength = state.board.length;
  let position = fromPosition;
  let totalSteps = 0;
  for (let i = 0; i < diceValue; i += 1) {
    position = (position + 1) % boardLength;
    totalSteps += 1;
  }
  while (isOccupiedByOtherPlayer(state, position, movingPlayerId)) {
    position = (position + 1) % boardLength;
    totalSteps += 1;
  }
  return { position, totalSteps };
}

/** Spaces adjacent to `lotId` with no staircase yet — the candidate spots a player could place one on, for either the paid or free flow. */
export function getStaircaseSpaceOptions(state: HotelState, lotId: string): BoardSpace[] {
  return state.board.filter((space) => space.adjacentLotIds.includes(lotId) && space.staircaseForLotId === null);
}

/**
 * nights is 1-6, matching the printed table's columns. A staircase right can
 * be bought on a lot before anything is built on it (canBuyStaircaseRightForLot
 * has no buildingsBuilt check), so landing there can still trigger a nights
 * roll (see applyRollMoveDice's `space.staircaseForLotId` branch) — with
 * nothing actually built (and no garden), there's nothing to charge for.
 */
export function computeNightlyRent(lot: HotelLot, nights: number): number {
  if (lot.buildingsBuilt === 0 && !lot.hasGarden) return 0;
  const nightsIndex = nights - 1;
  if (lot.hasGarden) return lot.gardenNightlyRates[nightsIndex];
  return lot.nightlyRates[lot.buildingsBuilt - 1][nightsIndex];
}

export function computeConstructionCost(lot: HotelLot, planItem: ConstructionPlanItem): number {
  let cost = 0;
  for (let i = 0; i < planItem.buildingCount; i += 1) {
    cost += lot.buildingPrices[lot.buildingsBuilt + i];
  }
  if (planItem.buildGarden) cost += lot.gardenPrice;
  return cost;
}

/** Total invested value (lot + built buildings + garden) — the basis for auction pricing. */
export function computeHotelValue(lot: HotelLot): number {
  const builtBuildingsCost = lot.buildingPrices
    .slice(0, lot.buildingsBuilt)
    .reduce((sum, price) => sum + price, 0);
  return lot.lotPrice + builtBuildingsCost + (lot.hasGarden ? lot.gardenPrice : 0);
}

export function computeAuctionOpeningBid(lot: HotelLot): number {
  return Math.floor(computeHotelValue(lot) / 2);
}

/**
 * "Ha a telek üres, de egy játékos már megvette, akkor féláron lehet tőle
 * megvenni" — explicitly qualified as an EMPTY (unbuilt) lot; a built-up
 * hotel can't be bought from another player via a Purchase space at all
 * (only via auction, when its owner can't pay a debt).
 */
export function canForceBuyFromOwner(lot: HotelLot): boolean {
  return lot.ownerId !== null && lot.buildingsBuilt === 0 && !lot.hasGarden;
}

export function computeLotPurchasePrice(lot: HotelLot): number {
  if (lot.ownerId === null) return lot.bankBuybackPrice ?? lot.lotPrice;
  return Math.floor(lot.lotPrice / 2);
}

export function eligibleBidderIds(state: HotelState, auctioneerId: PlayerId): PlayerId[] {
  return state.players.filter((p) => !p.bankrupt && p.id !== auctioneerId).map((p) => p.id);
}

// ---------------------------------------------------------------------------
// Action legality — the single source of truth for "is this action/choice
// legal right now." The reducer's apply* functions gate on exactly these
// (so an invalid action is rejected even if it didn't come from the UI, not
// just hidden by it), and selectors.ts's getValidActions() exposes the same
// checks so the UI — and later Hotel-0d's AI — can discover what's currently
// choosable without re-deriving any of this logic itself.
// ---------------------------------------------------------------------------

export function canRollMoveDice(state: HotelState): boolean {
  return state.turnPhase === 'AWAITING_ROLL';
}

export function canRollNights(state: HotelState): boolean {
  return state.turnPhase === 'AWAITING_NIGHTS_ROLL' && state.pendingNightsRollLotId !== null;
}

export function canRollBuildingPermit(state: HotelState): boolean {
  return state.turnPhase === 'AWAITING_BUILDING_PERMIT' && state.pendingConstructionPlan !== null;
}

export function canForfeit(state: HotelState): boolean {
  return state.turnPhase !== 'AUCTION_IN_PROGRESS';
}

export function canEndTurn(state: HotelState): boolean {
  return state.turnPhase === 'RESOLVING_SPACE';
}

export function canBuyLot(state: HotelState, lotId: string): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  const player = getCurrentPlayer(state);
  if (player.position < 0) return false;
  const space = state.board[player.position];
  if (space.type !== 'PURCHASE' || !space.adjacentLotIds.includes(lotId)) return false;
  const lot = getLot(state, lotId);
  if (lot.ownerId === player.id) return false;
  if (lot.ownerId !== null && !canForceBuyFromOwner(lot)) return false;
  return player.cash >= computeLotPurchasePrice(lot);
}

/** Owned lots with anything left to build — a building, the garden, or both. */
export function getConstructionEligibleLots(state: HotelState, playerId: PlayerId): HotelLot[] {
  return ownedLotsOf(state, playerId).filter((lot) => lot.buildingsBuilt < lot.buildingPrices.length || !lot.hasGarden);
}

export function canStartConstruction(state: HotelState): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE' || state.constructionLockedThisTurn) return false;
  const player = getCurrentPlayer(state);
  if (player.position < 0 || state.board[player.position].type !== 'CONSTRUCTION') return false;
  return getConstructionEligibleLots(state, player.id).length > 0;
}

/**
 * The next atomic build step for a lot, given how much has already been
 * tentatively picked this construction session (`pendingBuildingCount`/
 * `pendingGarden` — tracked client-side, not part of HotelState, since a
 * plan is only submitted once via START_CONSTRUCTION). Buildings always come
 * before the garden, so there's never more than one legal next step — this
 * is the single place that encodes that fixed order. Returns null once
 * nothing is left to add.
 */
export function getNextConstructionStep(
  lot: HotelLot,
  pendingBuildingCount: number,
  pendingGarden: boolean,
): ConstructionPlanItem | null {
  const nextBuildingIndex = lot.buildingsBuilt + pendingBuildingCount;
  if (nextBuildingIndex < lot.buildingPrices.length) {
    return { lotId: lot.id, buildingCount: pendingBuildingCount + 1, buildGarden: pendingGarden };
  }
  if (!lot.hasGarden && !pendingGarden) {
    return { lotId: lot.id, buildingCount: pendingBuildingCount, buildGarden: true };
  }
  return null;
}

/**
 * Validates a whole submitted plan — enforces the same fixed build order
 * `getNextConstructionStep` encodes (garden only once every building on that
 * lot is up), so a plan can't be crafted — by a future non-wheel UI, or a
 * modified client once Hotel-0b adds multiplayer — to build the garden
 * before finishing construction.
 */
export function isValidConstructionPlan(state: HotelState, playerId: PlayerId, plan: ConstructionPlanItem[]): boolean {
  if (plan.length === 0) return false;
  return plan.every((item) => {
    const lot = state.lots.find((l) => l.id === item.lotId);
    if (!lot || lot.ownerId !== playerId) return false;
    if (item.buildingCount === 0 && !item.buildGarden) return false;
    if (item.buildingCount < 0 || lot.buildingsBuilt + item.buildingCount > lot.buildingPrices.length) return false;
    if (item.buildGarden && lot.hasGarden) return false;
    return !(item.buildGarden && lot.buildingsBuilt + item.buildingCount < lot.buildingPrices.length);
  });
}

/** True only when every item requests a garden and nothing else — the one case that doesn't need the risky permit-die roll. */
export function isGardenOnlyPlan(plan: ConstructionPlanItem[]): boolean {
  return plan.length > 0 && plan.every((item) => item.buildingCount === 0 && item.buildGarden);
}

export function canBuildWithoutPermit(state: HotelState, playerId: PlayerId, plan: ConstructionPlanItem[]): boolean {
  if (!canStartConstruction(state)) return false;
  if (!isGardenOnlyPlan(plan)) return false;
  return isValidConstructionPlan(state, playerId, plan);
}

/** Everything except the specific space choice — shared by canBuyStaircaseRight and getStaircaseEligibleLots so "is this lot eligible at all" and "is this exact space valid" can't drift apart. */
function canBuyStaircaseRightForLot(state: HotelState, lotId: string): boolean {
  // `staircasePurchaseRightActive` alone stays true across the WHOLE rest of
  // the turn (cleared only at finishTurn) — without this phase check, an
  // auction/debt-resolution interrupting the same turn (e.g. the mover
  // couldn't afford a purchase right after crossing the lane) left the wheel
  // showing "Lépcső vásárlása" as still available to every player, not just
  // the bidding controls the AUCTION_IN_PROGRESS phase should restrict them
  // to — a real playtest bug (2026-07-30). Matches the same
  // RESOLVING_SPACE-only pattern canBuyLot/canStartConstruction already use.
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  if (!state.staircasePurchaseRightActive) return false;
  const player = getCurrentPlayer(state);
  const lot = getLot(state, lotId);
  if (lot.ownerId !== player.id) return false;
  if (state.lotsWithStaircasePurchasedThisTurn.includes(lotId)) return false;
  if (player.cash < lot.staircasePrice) return false;
  return getStaircaseSpaceOptions(state, lotId).length > 0;
}

export function canBuyStaircaseRight(state: HotelState, lotId: string, spaceId: string): boolean {
  if (!canBuyStaircaseRightForLot(state, lotId)) return false;
  return getStaircaseSpaceOptions(state, lotId).some((space) => space.id === spaceId);
}

export function getStaircaseEligibleLots(state: HotelState, playerId: PlayerId): HotelLot[] {
  return ownedLotsOf(state, playerId).filter((lot) => canBuyStaircaseRightForLot(state, lot.id));
}

export interface FreeStaircaseCandidate {
  lotId: string;
  spaceId: string;
}

/**
 * Every (lot, space) pair the current player could place a free staircase on
 * right now, combined across ALL their owned lots with room — the player
 * picks any one of these (docs/hotel-0a-specifikacio.md §9.2), unlike the
 * older auto-pick-the-first-one behavior.
 */
export function getFreeStaircaseCandidates(state: HotelState, playerId: PlayerId): FreeStaircaseCandidate[] {
  return ownedLotsOf(state, playerId).flatMap((lot) =>
    getStaircaseSpaceOptions(state, lot.id).map((space) => ({ lotId: lot.id, spaceId: space.id })),
  );
}

export function canChooseFreeStaircaseSpace(state: HotelState, lotId: string, spaceId: string): boolean {
  if (state.turnPhase !== 'AWAITING_FREE_STAIRCASE_CHOICE') return false;
  if (getLot(state, lotId).ownerId !== getCurrentPlayer(state).id) return false;
  return getStaircaseSpaceOptions(state, lotId).some((space) => space.id === spaceId);
}

/**
 * A lot's owner may put it up for auction either voluntarily, any time
 * during the free part of their own turn (2026-08-04 redesign — previously
 * only reachable when a debt was unpayable), or as the forced debt-raising
 * path (unchanged — see chargePlayer/afterDebtRaisingAction).
 *
 * The voluntary path excludes a lot bought (or force-bought) THIS turn — a
 * real playtest report: buying a lot and immediately re-auctioning it the
 * same turn made no sense. The forced debt-raising path deliberately does
 * NOT apply this restriction — it's a last-resort "raise cash or go
 * bankrupt" mechanism (see chargePlayer/afterDebtRaisingAction's own
 * `ownedLotsOf(...).length === 0` INSOLVENT check, which still counts a
 * just-bought lot as owned), so excluding it there could dead-end a player
 * into AWAITING_DEBT_RESOLUTION with nothing left to auction.
 */
export function canStartAuction(state: HotelState, lotId: string): boolean {
  if (getLot(state, lotId).ownerId !== getCurrentPlayer(state).id) return false;
  if (state.turnPhase === 'AWAITING_DEBT_RESOLUTION') return state.pendingDebt !== null;
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  return !state.lotsBoughtThisTurn.includes(lotId);
}

/** Lots the current player could put up for auction right now — either voluntarily (own turn, excluding lots bought this same turn — see canStartAuction) or to raise cash toward a pending debt (no such exclusion). */
export function getAuctionableLots(state: HotelState): HotelLot[] {
  const isDebtPhase = state.turnPhase === 'AWAITING_DEBT_RESOLUTION' && state.pendingDebt !== null;
  if (!isDebtPhase && state.turnPhase !== 'RESOLVING_SPACE') return [];
  const owned = ownedLotsOf(state, getCurrentPlayer(state).id);
  if (isDebtPhase) return owned;
  return owned.filter((lot) => !state.lotsBoughtThisTurn.includes(lot.id));
}

export function canPlaceBid(state: HotelState, bidderId: PlayerId, amount: number): boolean {
  if (state.turnPhase !== 'AUCTION_IN_PROGRESS' || !state.pendingAuction) return false;
  const auction = state.pendingAuction;
  // currentBidderId is the primary gate (bidding is strictly sequential); the
  // passedPlayerIds check is defense-in-depth — a correctly-driven auction
  // never lets currentBidderId land back on someone who already passed (see
  // reducer.ts's nextBidderInRotation), but this keeps the rule correct on
  // its own even if some future caller hand-builds a HotelState directly.
  if (auction.currentBidderId !== bidderId || auction.passedPlayerIds.includes(bidderId)) return false;
  if (amount <= auction.highestBid) return false;
  return getPlayer(state, bidderId).cash >= amount;
}

export function canPassBid(state: HotelState, bidderId: PlayerId): boolean {
  if (state.turnPhase !== 'AUCTION_IN_PROGRESS' || !state.pendingAuction) return false;
  const auction = state.pendingAuction;
  return auction.currentBidderId === bidderId && !auction.passedPlayerIds.includes(bidderId);
}

/** Bidders who haven't passed yet — the ones still able to act in the current auction (currentBidderId is the very next one, in seat order). */
export function getRemainingBidderIds(state: HotelState): PlayerId[] {
  if (!state.pendingAuction) return [];
  const auction = state.pendingAuction;
  return eligibleBidderIds(state, auction.auctioneerId).filter((id) => !auction.passedPlayerIds.includes(id));
}

/** The minimum amount a next PLACE_BID must strictly exceed — free-form otherwise, no fixed increment (2026-08-04 redesign). Null when there's no auction in progress. */
export function getMinimumBidAmount(state: HotelState): number | null {
  return state.pendingAuction ? state.pendingAuction.highestBid + 1 : null;
}
