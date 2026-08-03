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
  getNextConstructionStep,
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

/**
 * Shared bankruptcy body — sends every owned lot back to the bank, zeroes
 * cash, clears all pending debt/auction/construction state, and ends the
 * turn. Used both for a player's own voluntary "Feladás" (VOLUNTARY) and for
 * an automatic bankruptcy the engine forces when a debt is unpayable and the
 * player owns no lot left to auction (INSOLVENT — see chargePlayer/
 * afterDebtRaisingAction below), so there genuinely is no other outcome.
 */
function forfeitPlayer(state: HotelState, playerId: PlayerId, reason: 'VOLUNTARY' | 'INSOLVENT'): HotelState {
  let next = state;
  for (const lot of ownedLotsOf(state, playerId)) {
    next = updateLot(next, lot.id, { ownerId: null, bankBuybackPrice: computeAuctionOpeningBid(lot) });
  }
  next = updatePlayer(next, playerId, { bankrupt: true, cash: 0 });
  next = { ...next, pendingDebt: null, pendingAuction: null, pendingConstructionPlan: null };
  next = appendLog(next, { type: 'FORFEITED', playerId, reason });
  return finishTurn(next);
}

/**
 * Deducts `amount` if affordable; otherwise parks the turn in
 * AWAITING_DEBT_RESOLUTION so the player can auction a lot to raise cash —
 * UNLESS they own no lot at all, in which case there is no possible way to
 * raise the shortfall, so the dead-end debt-resolution phase (an "Árverés"
 * option with nothing to auction) is skipped entirely and the player is
 * bankrupted immediately instead (real playtest report, 2026-07-31).
 */
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
  if (ownedLotsOf(state, playerId).length === 0) return forfeitPlayer(state, playerId, 'INSOLVENT');
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

/**
 * After a debt-raising action (auction proceeds), pays off the debt if now
 * affordable — otherwise re-parks in AWAITING_DEBT_RESOLUTION to auction
 * another lot, UNLESS the one just auctioned was the player's last (see
 * chargePlayer's own note — same INSOLVENT bankruptcy, same reasoning).
 */
function afterDebtRaisingAction(state: HotelState, playerId: PlayerId): HotelState {
  if (!state.pendingDebt) return { ...state, turnPhase: 'RESOLVING_SPACE' };
  const player = getPlayer(state, playerId);
  if (player.cash < state.pendingDebt.amount) {
    if (ownedLotsOf(state, playerId).length === 0) return forfeitPlayer(state, playerId, 'INSOLVENT');
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
  // START never auto-ends the turn (real playtest report, 2026-08-01): a
  // player who crossed the STAIRCASE_PURCHASE_RIGHT lane in the same roll and
  // landed exactly on START must still get to use that right before their
  // turn ends — so START falls through to the same RESOLVING_SPACE state as
  // every other space, letting the player act (or manually end their turn)
  // instead of the engine silently doing it for them.
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

/**
 * The single next legal build step per eligible owned lot — reuses
 * `getNextConstructionStep`, the ONE place the fixed build order (every
 * building before the garden) is encoded, instead of re-deriving eligibility
 * here. Real playtest bug (2026-07-31): the previous version offered a lot's
 * garden whenever `!hasGarden`, regardless of `buildingsBuilt`, so an
 * untouched L'etoile lot (garden 4000 > any single building tier) always won
 * the "most expensive option" pick below — the reported "ingyen épület mező
 * kertet adott, pedig még egy épület sem állt a telken" bug.
 */
function freeBuildOptionsOf(buildable: HotelLot[]): FreeBuildOption[] {
  return buildable.flatMap((lot): FreeBuildOption[] => {
    const step = getNextConstructionStep(lot, 0, false);
    if (!step) return [];
    return step.buildGarden
      ? [{ lotId: lot.id, price: lot.gardenPrice, kind: 'garden' }]
      : [{ lotId: lot.id, price: lot.buildingPrices[lot.buildingsBuilt], kind: 'building' }];
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
    // Every owned lot is already fully built (buildings + garden) — pay the
    // most expensive MAIN building (first building tier) among the player's
    // own lots, per the user's explicit rule (2026-07-31 playtest report),
    // NOT the max across every tier/garden (that overpaid — e.g. a fully
    // built L'etoile's 4000 garden price used to win over a fully built,
    // cheaper lot's main building).
    const maxPrice = Math.max(...owned.map((lot) => lot.buildingPrices[0]));
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
  // chargePlayer may have already bankrupted+finished the turn (INSOLVENT,
  // no lot to auction) — that state must be returned as-is, never
  // overwritten by the RESOLVING_SPACE fallback below.
  if (getPlayer(next, player.id).bankrupt) return next;
  if (next.turnPhase === 'AWAITING_DEBT_RESOLUTION') return next;

  // START never auto-ends the turn — see the matching note in applyRollMoveDice.
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
  const auctionSeed: PendingAuction = {
    lotId,
    auctioneerId: player.id,
    highestBid: openingBid,
    highestBidderId: null,
    passedPlayerIds: [],
    // Placeholder — canStartAuction already guarantees >=2 non-bankrupt
    // players, so nextBidderInRotation always replaces this with a real
    // bidder (whoever sits immediately after the auctioneer), never falls
    // through to this fallback for real.
    currentBidderId: player.id,
  };
  const next: HotelState = {
    ...state,
    turnPhase: 'AUCTION_IN_PROGRESS',
    pendingAuction: { ...auctionSeed, currentBidderId: nextBidderInRotation(state, auctionSeed, player.id) },
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

/**
 * Who bids/passes next, walking the REAL board seat order (not just
 * `eligibleBidderIds`' filtered list, which loses the auctioneer's own seat
 * position) starting right after `afterId` — so bidding always continues
 * with whoever sits immediately next at the table, wrapping around past the
 * auctioneer, rather than jumping back to seat 1. The caller only invokes
 * this once it's already confirmed more than one eligible bidder remains, so
 * a candidate is always found within one lap (never falls through to the
 * `afterId` fallback for real).
 */
function nextBidderInRotation(state: HotelState, auction: PendingAuction, afterId: PlayerId): PlayerId {
  const seatOrder = state.players.map((p) => p.id);
  const startIndex = seatOrder.indexOf(afterId);
  for (let step = 1; step <= seatOrder.length; step += 1) {
    const candidateId = seatOrder[(startIndex + step) % seatOrder.length];
    if (candidateId === auction.auctioneerId) continue;
    if (getPlayer(state, candidateId).bankrupt) continue;
    if (auction.passedPlayerIds.includes(candidateId)) continue;
    return candidateId;
  }
  return afterId;
}

/** Resolves once at most one eligible bidder still hasn't passed; otherwise advances `currentBidderId` to the next in seat-order rotation after whoever just acted. */
function maybeResolveAuction(state: HotelState, auction: PendingAuction, actedBidderId: PlayerId): HotelState {
  const remaining = eligibleBidderIds(state, auction.auctioneerId).filter((id) => !auction.passedPlayerIds.includes(id));
  if (remaining.length <= 1) return resolveAuction(state, auction);
  const currentBidderId = nextBidderInRotation(state, auction, actedBidderId);
  return { ...state, pendingAuction: { ...auction, currentBidderId } };
}

function applyPlaceBid(state: HotelState, bidderId: PlayerId, amount: number): HotelState {
  if (!canPlaceBid(state, bidderId, amount) || !state.pendingAuction) return state;
  const auction = state.pendingAuction;
  const next = appendLog(state, { type: 'BID_PLACED', playerId: bidderId, lotId: auction.lotId, amount });
  return maybeResolveAuction(next, { ...auction, highestBid: amount, highestBidderId: bidderId }, bidderId);
}

function applyPassBid(state: HotelState, bidderId: PlayerId): HotelState {
  if (!canPassBid(state, bidderId) || !state.pendingAuction) return state;
  const auction = state.pendingAuction;
  const next = appendLog(state, { type: 'BID_PASSED', playerId: bidderId, lotId: auction.lotId });
  return maybeResolveAuction(next, { ...auction, passedPlayerIds: [...auction.passedPlayerIds, bidderId] }, bidderId);
}

function applyForfeit(state: HotelState): HotelState {
  if (!canForfeit(state)) return state;
  return forfeitPlayer(state, getCurrentPlayer(state).id, 'VOLUNTARY');
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
