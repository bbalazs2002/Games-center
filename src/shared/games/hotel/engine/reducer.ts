import type { HotelAction } from './actions';
import {
  activePlayerCount,
  appendLog,
  canBuildWithoutPermit,
  canBuyLot,
  canBuyStaircaseRight,
  canChooseFreeStaircaseSpace,
  canEndTurn,
  canForfeit,
  canPassBid,
  canPlaceBid,
  canRollBuildingPermit,
  canRollMoveDice,
  canRollNights,
  canStartAuction,
  canStartConstruction,
  computeAuctionOpeningBid,
  computeConstructionCost,
  computeLotPurchasePrice,
  computeNightlyRent,
  crossedLanes,
  eligibleBidderIds,
  getConstructionEligibleLots,
  getCurrentPlayer,
  getFreeStaircaseCandidates,
  getLot,
  getPlayer,
  isValidConstructionPlan,
  nextActivePlayerIndex,
  ownedLotsOf,
  resolveLandingPosition,
  updateLot,
  updatePlayer,
  updateSpace,
} from './rules';
import type {
  BuildingPermitResult,
  ConstructionPlanItem,
  HotelLot,
  HotelState,
  PendingAuction,
  PlayerId,
} from './state';

function payFromBank(state: HotelState, playerId: PlayerId, amount: number): HotelState {
  const player = getPlayer(state, playerId);
  return updatePlayer(state, playerId, { cash: player.cash + amount });
}

/** Deducts `amount` if affordable; otherwise parks the turn in AWAITING_DEBT_RESOLUTION. */
function chargePlayer(
  state: HotelState,
  playerId: PlayerId,
  amount: number,
  creditorId: PlayerId | null,
): HotelState {
  if (amount <= 0) return state;
  const player = getPlayer(state, playerId);
  if (player.cash >= amount) {
    let next = updatePlayer(state, playerId, { cash: player.cash - amount });
    if (creditorId) next = payFromBank(next, creditorId, amount);
    return next;
  }
  return { ...state, turnPhase: 'AWAITING_DEBT_RESOLUTION', pendingDebt: { amount, creditorId } };
}

function checkWinCondition(state: HotelState): HotelState {
  if (activePlayerCount(state) !== 1) return state;
  const winner = state.players.find((p) => !p.bankrupt) ?? null;
  const next: HotelState = { ...state, status: 'FINISHED', winnerId: winner?.id ?? null };
  return winner ? appendLog(next, { type: 'GAME_WON', playerId: winner.id }) : next;
}

function finishTurn(state: HotelState): HotelState {
  const checked = checkWinCondition(state);
  if (checked.status === 'FINISHED') return { ...checked, turnPhase: 'TURN_COMPLETE' };
  return {
    ...checked,
    currentPlayerIndex: nextActivePlayerIndex(checked),
    turnPhase: 'AWAITING_ROLL',
    lastMoveRoll: null,
    lastNightsRoll: null,
    pendingConstructionPlan: null,
    lastBuildingPermitRoll: null,
    constructionLockedThisTurn: false,
    pendingNightsRollLotId: null,
    staircasePurchaseRightActive: false,
    lotsWithStaircasePurchasedThisTurn: [],
  };
}

/** After a debt-raising action (auction proceeds), pays off the debt if now affordable. */
function afterDebtRaisingAction(state: HotelState, playerId: PlayerId): HotelState {
  if (!state.pendingDebt) return { ...state, turnPhase: 'RESOLVING_SPACE' };
  const player = getPlayer(state, playerId);
  if (player.cash < state.pendingDebt.amount) {
    return { ...state, turnPhase: 'AWAITING_DEBT_RESOLUTION' };
  }
  let next = updatePlayer(state, playerId, { cash: player.cash - state.pendingDebt.amount });
  if (state.pendingDebt.creditorId) next = payFromBank(next, state.pendingDebt.creditorId, state.pendingDebt.amount);
  return { ...next, pendingDebt: null, turnPhase: 'RESOLVING_SPACE' };
}

// A staircase right can be bought before anything is built on the lot (see
// computeNightlyRent's own note), and a player never owes themselves rent
// (applyRollNights' own isOwnHotel check) — both cases mean the roll's
// outcome is a GUARANTEED zero, so applyRollMoveDice skips the whole
// nights-roll procedure entirely instead of asking the landing player to
// roll for a result that can never matter. Returns null (falls through to
// the space's own type handling) in every other case, exactly as if there
// were no staircase here at all.
function staircaseLotWithPossibleRent(state: HotelState, playerId: PlayerId, space: HotelState['board'][number]): string | null {
  if (!space.staircaseForLotId) return null;
  const staircaseLot = getLot(state, space.staircaseForLotId);
  // `ownerId === null` means the BANK owns it (e.g. after a forfeit/no-bid
  // auction — see applyForfeit/resolveAuction, neither of which resets
  // buildingsBuilt/hasGarden, so a bank-owned lot can still have buildings)
  // — no one to pay rent to in that case, same as landing on your own lot.
  const rentCouldBeOwed =
    staircaseLot.ownerId !== null &&
    staircaseLot.ownerId !== playerId &&
    (staircaseLot.buildingsBuilt > 0 || staircaseLot.hasGarden);
  return rentCouldBeOwed ? space.staircaseForLotId : null;
}

function applyRollMoveDice(state: HotelState, value: number): HotelState {
  if (!canRollMoveDice(state)) return state;
  const player = getCurrentPlayer(state);
  const boardLength = state.board.length;
  const { position: newPosition, totalSteps } = resolveLandingPosition(state, player.position, value, player.id);
  const lanes = crossedLanes(player.position, totalSteps, boardLength, state.specialLanes);

  let next = updatePlayer(state, player.id, { position: newPosition });
  next = { ...next, lastMoveRoll: value };
  next = appendLog(next, {
    type: 'MOVED',
    playerId: player.id,
    roll: value,
    fromPosition: player.position,
    toPosition: newPosition,
  });

  for (const lane of lanes) {
    if (lane.effect === 'BONUS_2000') {
      next = payFromBank(next, player.id, 2000);
      next = appendLog(next, { type: 'BONUS_2000', playerId: player.id });
    } else {
      next = { ...next, staircasePurchaseRightActive: true, lotsWithStaircasePurchasedThisTurn: [] };
      next = appendLog(next, { type: 'STAIRCASE_RIGHT_ACTIVATED', playerId: player.id });
    }
  }

  const space = next.board[newPosition];
  const owedStaircaseLotId = staircaseLotWithPossibleRent(next, player.id, space);
  if (owedStaircaseLotId) {
    return { ...next, turnPhase: 'AWAITING_NIGHTS_ROLL', pendingNightsRollLotId: owedStaircaseLotId };
  }
  if (space.type === 'START') return finishTurn(next);
  // FREE_BUILDING resolves automatically on landing — there's nothing for the
  // player to decide (docs/hotel-0a-specifikacio.md §2 says "valamelyik
  // hoteled", i.e. the game's own pick, and unlike a staircase a building
  // isn't placed on a specific board space), so no repeatable "claim reward"
  // button that could be clicked more than once. FREE_STAIRCASE, in
  // contrast, DOES let the player choose which lot/space (§9.2) — see
  // resolveFreeStaircaseLanding.
  if (space.type === 'FREE_STAIRCASE') {
    return resolveFreeStaircaseLanding(next, player.id);
  }
  if (space.type === 'FREE_BUILDING') {
    return { ...resolveFreeBuilding(next, player.id), turnPhase: 'RESOLVING_SPACE' };
  }
  return { ...next, turnPhase: 'RESOLVING_SPACE' };
}

function applyBuyLot(state: HotelState, lotId: string): HotelState {
  if (!canBuyLot(state, lotId)) return state;
  const player = getCurrentPlayer(state);
  const lot = getLot(state, lotId);
  const price = computeLotPurchasePrice(lot);
  const previousOwnerId = lot.ownerId;

  let next = updatePlayer(state, player.id, { cash: player.cash - price });
  // A force-buy ("féláron megveheted tőle") is a purchase FROM that other
  // player, not from the bank — they must receive the payment. Only a
  // bank-owned (unowned) lot has no one to pay.
  if (previousOwnerId !== null) next = payFromBank(next, previousOwnerId, price);
  next = updateLot(next, lotId, { ownerId: player.id, bankBuybackPrice: null });
  return appendLog(next, { type: 'LOT_BOUGHT', playerId: player.id, lotId, price });
}

function applyStartConstruction(state: HotelState, plan: ConstructionPlanItem[]): HotelState {
  if (!canStartConstruction(state)) return state;
  const player = getCurrentPlayer(state);
  if (!isValidConstructionPlan(state, player.id, plan)) return state;

  return { ...state, pendingConstructionPlan: plan, turnPhase: 'AWAITING_BUILDING_PERMIT' };
}

/** A garden-only plan skips the permit-die risk entirely — full price, guaranteed, no roll. See docs/hotel-0a-specifikacio.md §9.2 and canBuildWithoutPermit. */
function applyBuildWithoutPermit(state: HotelState, plan: ConstructionPlanItem[]): HotelState {
  const player = getCurrentPlayer(state);
  if (!canBuildWithoutPermit(state, player.id, plan)) return state;

  let next: HotelState = { ...state, turnPhase: 'RESOLVING_SPACE' };
  let totalCost = 0;
  for (const item of plan) {
    const lot = getLot(next, item.lotId);
    totalCost += computeConstructionCost(lot, item);
    next = updateLot(next, item.lotId, { hasGarden: true });
  }
  next = appendLog(next, { type: 'GARDEN_BUILT_WITHOUT_PERMIT', playerId: player.id, plan, totalCost });
  return chargePlayer(next, player.id, totalCost, null);
}

function applyRollBuildingPermit(state: HotelState, value: BuildingPermitResult): HotelState {
  if (!canRollBuildingPermit(state) || !state.pendingConstructionPlan) return state;
  const plan = state.pendingConstructionPlan;
  const player = getCurrentPlayer(state);

  if (value === 'RED') {
    const next: HotelState = {
      ...state,
      pendingConstructionPlan: null,
      lastBuildingPermitRoll: value,
      constructionLockedThisTurn: true,
      turnPhase: 'RESOLVING_SPACE',
    };
    return appendLog(next, { type: 'CONSTRUCTION_PERMIT_ROLLED', playerId: player.id, result: value, plan, totalCost: 0 });
  }

  let next: HotelState = {
    ...state,
    pendingConstructionPlan: null,
    lastBuildingPermitRoll: value,
    turnPhase: 'RESOLVING_SPACE',
  };
  let totalCost = 0;
  for (const item of plan) {
    const lot = getLot(next, item.lotId);
    totalCost += computeConstructionCost(lot, item);
    next = updateLot(next, item.lotId, {
      buildingsBuilt: lot.buildingsBuilt + item.buildingCount,
      hasGarden: lot.hasGarden || Boolean(item.buildGarden),
    });
  }
  if (value === 'DOUBLE') totalCost *= 2;
  next = appendLog(next, { type: 'CONSTRUCTION_PERMIT_ROLLED', playerId: player.id, result: value, plan, totalCost });

  if (value === 'FREE') return next;
  return chargePlayer(next, player.id, totalCost, null);
}

/**
 * Only auto-resolves the cash fallback, when there's genuinely nothing to
 * choose from (no lots, or no room anywhere); otherwise parks the turn in
 * AWAITING_FREE_STAIRCASE_CHOICE for the player to pick which lot/space —
 * see docs/hotel-0a-specifikacio.md §9.2 and applyChooseFreeStaircaseSpace.
 */
function resolveFreeStaircaseLanding(state: HotelState, playerId: PlayerId): HotelState {
  const owned = ownedLotsOf(state, playerId);
  if (owned.length === 0) {
    const next = payFromBank(state, playerId, 100);
    const logged = appendLog(next, { type: 'FREE_STAIRCASE_GRANTED', playerId, lotId: null, payoutReceived: 100 });
    return { ...logged, turnPhase: 'RESOLVING_SPACE' };
  }

  if (getFreeStaircaseCandidates(state, playerId).length === 0) {
    const maxPrice = Math.max(...owned.map((lot) => lot.staircasePrice));
    const next = payFromBank(state, playerId, maxPrice);
    const logged = appendLog(next, { type: 'FREE_STAIRCASE_GRANTED', playerId, lotId: null, payoutReceived: maxPrice });
    return { ...logged, turnPhase: 'RESOLVING_SPACE' };
  }

  return { ...state, turnPhase: 'AWAITING_FREE_STAIRCASE_CHOICE' };
}

function applyChooseFreeStaircaseSpace(state: HotelState, lotId: string, spaceId: string): HotelState {
  if (!canChooseFreeStaircaseSpace(state, lotId, spaceId)) return state;
  const player = getCurrentPlayer(state);
  const next = updateSpace(state, spaceId, { staircaseForLotId: lotId });
  const logged = appendLog(next, { type: 'FREE_STAIRCASE_GRANTED', playerId: player.id, lotId, payoutReceived: 0 });
  return { ...logged, turnPhase: 'RESOLVING_SPACE' };
}

interface FreeBuildOption {
  lotId: string;
  price: number;
  kind: 'building' | 'garden';
}

/** Every still-buildable option across ALL eligible owned lots — the next building tier's price on lots with room left, and/or the garden's price on lots without one yet (a lot can offer both at once). */
function freeBuildOptionsOf(buildable: HotelLot[]): FreeBuildOption[] {
  return buildable.flatMap((lot) => {
    const options: FreeBuildOption[] = [];
    if (lot.buildingsBuilt < lot.buildingPrices.length) {
      options.push({ lotId: lot.id, price: lot.buildingPrices[lot.buildingsBuilt], kind: 'building' });
    }
    if (!lot.hasGarden) options.push({ lotId: lot.id, price: lot.gardenPrice, kind: 'garden' });
    return options;
  });
}

/**
 * Picks the single most expensive buildable option across ALL of the
 * player's lots — NOT just the first eligible lot's cheapest next step. Real
 * playtest report (2026-07-30): "az összes saját telkén a legdrágább
 * megépíthető épületet (vagy kertet) kapja meg a játékos."
 */
function resolveFreeBuilding(state: HotelState, playerId: PlayerId): HotelState {
  const owned = ownedLotsOf(state, playerId);
  // "Ha nincs telked, akkor nem történik semmi" — no fallback money, unlike staircase.
  if (owned.length === 0) return appendLog(state, { type: 'FREE_BUILDING_GRANTED', playerId, lotId: null, payoutReceived: 0 });

  const buildable = getConstructionEligibleLots(state, playerId);
  if (buildable.length === 0) {
    const maxPrice = Math.max(...owned.flatMap((lot) => [...lot.buildingPrices, lot.gardenPrice]));
    const next = payFromBank(state, playerId, maxPrice);
    return appendLog(next, { type: 'FREE_BUILDING_GRANTED', playerId, lotId: null, payoutReceived: maxPrice });
  }

  const options = freeBuildOptionsOf(buildable);
  const best = options.reduce((a, b) => (b.price > a.price ? b : a));
  const target = getLot(state, best.lotId);
  const next =
    best.kind === 'building'
      ? updateLot(state, target.id, { buildingsBuilt: target.buildingsBuilt + 1 })
      : updateLot(state, target.id, { hasGarden: true });
  return appendLog(next, { type: 'FREE_BUILDING_GRANTED', playerId, lotId: target.id, payoutReceived: 0 });
}

function applyRollNights(state: HotelState, value: number): HotelState {
  if (!canRollNights(state) || !state.pendingNightsRollLotId) return state;
  const lot = getLot(state, state.pendingNightsRollLotId);
  const player = getCurrentPlayer(state);

  let next: HotelState = { ...state, pendingNightsRollLotId: null, lastNightsRoll: value };
  // Bank-owned (ownerId === null) is treated the same as your own hotel here
  // — no one to pay rent to — see staircaseLotWithPossibleRent's own note.
  const isOwnHotel = lot.ownerId === player.id || lot.ownerId === null;
  const rentAmount = isOwnHotel ? 0 : computeNightlyRent(lot, value);
  next = appendLog(next, {
    type: 'NIGHTS_STAY',
    playerId: player.id,
    lotId: lot.id,
    nights: value,
    rentAmount,
    toPlayerId: isOwnHotel ? null : lot.ownerId,
  });
  if (!isOwnHotel) {
    next = chargePlayer(next, player.id, rentAmount, lot.ownerId);
  }
  if (next.turnPhase === 'AWAITING_DEBT_RESOLUTION') return next;

  const space = next.board[player.position];
  if (space.type === 'START') return finishTurn(next);
  return { ...next, turnPhase: 'RESOLVING_SPACE' };
}

function applyBuyStaircaseRight(state: HotelState, lotId: string, spaceId: string): HotelState {
  if (!canBuyStaircaseRight(state, lotId, spaceId)) return state;
  const player = getCurrentPlayer(state);
  const lot = getLot(state, lotId);

  let next = updatePlayer(state, player.id, { cash: player.cash - lot.staircasePrice });
  next = updateSpace(next, spaceId, { staircaseForLotId: lotId });
  next = { ...next, lotsWithStaircasePurchasedThisTurn: [...next.lotsWithStaircasePurchasedThisTurn, lotId] };
  return appendLog(next, { type: 'STAIRCASE_RIGHT_BOUGHT', playerId: player.id, lotId, price: lot.staircasePrice });
}

function applyStartAuction(state: HotelState, lotId: string): HotelState {
  if (!canStartAuction(state, lotId)) return state;
  const player = getCurrentPlayer(state);
  const lot = getLot(state, lotId);
  const openingBid = computeAuctionOpeningBid(lot);

  const next: HotelState = {
    ...state,
    turnPhase: 'AUCTION_IN_PROGRESS',
    pendingAuction: {
      lotId,
      auctioneerId: player.id,
      highestBid: openingBid,
      highestBidderId: null,
      passedPlayerIds: [],
    },
  };
  return appendLog(next, { type: 'AUCTION_STARTED', playerId: player.id, lotId, openingBid });
}

function resolveAuction(state: HotelState, auction: PendingAuction): HotelState {
  let next = updateLot(
    state,
    auction.lotId,
    auction.highestBidderId
      ? { ownerId: auction.highestBidderId, bankBuybackPrice: null }
      : { ownerId: null, bankBuybackPrice: auction.highestBid },
  );

  if (auction.highestBidderId) {
    const winner = getPlayer(next, auction.highestBidderId);
    next = updatePlayer(next, auction.highestBidderId, { cash: winner.cash - auction.highestBid });
  }

  next = payFromBank(next, auction.auctioneerId, auction.highestBid);
  next = { ...next, pendingAuction: null };
  next = appendLog(next, {
    type: 'AUCTION_RESOLVED',
    lotId: auction.lotId,
    winnerId: auction.highestBidderId,
    amount: auction.highestBid,
  });
  return afterDebtRaisingAction(next, auction.auctioneerId);
}

/** Resolves once at most one eligible bidder still hasn't passed. */
function maybeResolveAuction(state: HotelState, auction: PendingAuction): HotelState {
  const eligible = eligibleBidderIds(state, auction.auctioneerId);
  const remaining = eligible.filter((id) => !auction.passedPlayerIds.includes(id));
  if (remaining.length > 1) return { ...state, pendingAuction: auction };
  return resolveAuction(state, auction);
}

function applyPlaceBid(state: HotelState, bidderId: PlayerId, amount: number): HotelState {
  if (!canPlaceBid(state, bidderId, amount) || !state.pendingAuction) return state;
  const auction = state.pendingAuction;
  const next = appendLog(state, { type: 'BID_PLACED', playerId: bidderId, lotId: auction.lotId, amount });
  return maybeResolveAuction(next, { ...auction, highestBid: amount, highestBidderId: bidderId });
}

function applyPassBid(state: HotelState, bidderId: PlayerId): HotelState {
  if (!canPassBid(state, bidderId) || !state.pendingAuction) return state;
  const auction = state.pendingAuction;
  const next = appendLog(state, { type: 'BID_PASSED', playerId: bidderId, lotId: auction.lotId });
  return maybeResolveAuction(next, { ...auction, passedPlayerIds: [...auction.passedPlayerIds, bidderId] });
}

function applyForfeit(state: HotelState): HotelState {
  if (!canForfeit(state)) return state;
  const player = getCurrentPlayer(state);

  let next = state;
  for (const lot of ownedLotsOf(state, player.id)) {
    next = updateLot(next, lot.id, { ownerId: null, bankBuybackPrice: computeAuctionOpeningBid(lot) });
  }
  next = updatePlayer(next, player.id, { bankrupt: true, cash: 0 });
  next = { ...next, pendingDebt: null, pendingAuction: null, pendingConstructionPlan: null };
  next = appendLog(next, { type: 'FORFEITED', playerId: player.id });
  return finishTurn(next);
}

function applyEndTurn(state: HotelState): HotelState {
  if (!canEndTurn(state)) return state;
  return finishTurn(state);
}

// Split into two dispatch functions (rather than one 13-case switch) purely to
// stay under the project's ESLint complexity limit — each half is a plain
// per-action-type routing table, not meaningfully-branching logic.
function dispatchMovementAndProperty(state: HotelState, action: HotelAction): HotelState | undefined {
  switch (action.type) {
    case 'ROLL_MOVE_DICE':
      return applyRollMoveDice(state, action.value);
    case 'BUY_LOT':
      return applyBuyLot(state, action.lotId);
    case 'START_CONSTRUCTION':
      return applyStartConstruction(state, action.plan);
    case 'ROLL_BUILDING_PERMIT':
      return applyRollBuildingPermit(state, action.value);
    case 'BUILD_WITHOUT_PERMIT':
      return applyBuildWithoutPermit(state, action.plan);
    case 'ROLL_NIGHTS':
      return applyRollNights(state, action.value);
    default:
      return undefined;
  }
}

function dispatchStaircaseAuctionAndTurn(state: HotelState, action: HotelAction): HotelState | undefined {
  switch (action.type) {
    case 'BUY_STAIRCASE_RIGHT':
      return applyBuyStaircaseRight(state, action.lotId, action.spaceId);
    case 'CHOOSE_FREE_STAIRCASE_SPACE':
      return applyChooseFreeStaircaseSpace(state, action.lotId, action.spaceId);
    case 'START_AUCTION':
      return applyStartAuction(state, action.lotId);
    case 'PLACE_BID':
      return applyPlaceBid(state, action.bidderId, action.amount);
    case 'PASS_BID':
      return applyPassBid(state, action.bidderId);
    case 'FORFEIT':
      return applyForfeit(state);
    case 'END_TURN':
      return applyEndTurn(state);
    default:
      return undefined;
  }
}

export function reducer(state: HotelState, action: HotelAction): HotelState {
  if (state.status !== 'IN_PROGRESS') return state;
  return dispatchMovementAndProperty(state, action) ?? dispatchStaircaseAuctionAndTurn(state, action) ?? state;
}
