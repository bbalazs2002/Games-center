import { describe, expect, it } from 'vitest';
import { HOTEL_CONFIGS } from './hotelConfigs';
import { createInitialState } from './initialState';
import {
  canBuildWithoutPermit,
  canBuyLot,
  canBuyStaircaseRight,
  canChooseFreeStaircaseSpace,
  canForceBuyFromOwner,
  canPassBid,
  canPlaceBid,
  canStartConstruction,
  computeAuctionOpeningBid,
  computeConstructionCost,
  computeHotelValue,
  computeLotPurchasePrice,
  computeNightlyRent,
  crossedLanes,
  getFreeStaircaseCandidates,
  getNextConstructionStep,
  isGardenOnlyPlan,
  isValidConstructionPlan,
  resolveLandingPosition,
  updateLot,
  updatePlayer,
  updateSpace,
} from './rules';
import type { HotelLot, HotelState } from './state';

const waikikiConfig = HOTEL_CONFIGS.find((c) => c.id === 'waikiki')!;

function baseLot(overrides: Partial<HotelLot> = {}): HotelLot {
  return {
    ...waikikiConfig,
    ownerId: null,
    buildingsBuilt: 0,
    hasGarden: false,
    bankBuybackPrice: null,
    ...overrides,
  };
}

describe('resolveLandingPosition', () => {
  it('lands normally when the intended space is free', () => {
    const state = createInitialState(['Alice', 'Bob']);
    const result = resolveLandingPosition(state, 0, 3, 'player-1');
    expect(result).toEqual({ position: 3, totalSteps: 3 });
  });

  it('pushes forward past a space occupied by another (non-bankrupt) player', () => {
    let state = createInitialState(['Alice', 'Bob']);
    state = updatePlayer(state, 'player-2', { position: 3 }); // in the way of player-1's intended landing
    const result = resolveLandingPosition(state, 0, 3, 'player-1');
    expect(result).toEqual({ position: 4, totalSteps: 4 });
  });

  it('keeps pushing through consecutive occupied spaces', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol']);
    state = updatePlayer(state, 'player-2', { position: 3 });
    state = updatePlayer(state, 'player-3', { position: 4 });
    const result = resolveLandingPosition(state, 0, 3, 'player-1');
    expect(result).toEqual({ position: 5, totalSteps: 5 });
  });

  it('Start is a normal space now — an occupying player still causes a push (only the parkoló is exempt)', () => {
    let state = createInitialState(['Alice', 'Bob']);
    state = updatePlayer(state, 'player-2', { position: 0 }); // explicitly on Start, not the parkoló
    const result = resolveLandingPosition(state, 29, 2, 'player-1'); // intended landing is Start (index 0), occupied
    expect(result).toEqual({ position: 1, totalSteps: 3 });
  });

  it('ignores bankrupt players when checking occupancy', () => {
    let state = createInitialState(['Alice', 'Bob']);
    state = updatePlayer(state, 'player-2', { position: 3, bankrupt: true });
    const result = resolveLandingPosition(state, 0, 3, 'player-1');
    expect(result).toEqual({ position: 3, totalSteps: 3 });
  });
});

describe('crossedLanes', () => {
  it('detects a lane crossed mid-move', () => {
    const lanes = [{ afterSpaceIndex: 6, effect: 'BONUS_2000' as const }];
    expect(crossedLanes(4, 3, 31, lanes)).toEqual(lanes); // steps land on indices 4,5,6 -> crosses after 6
  });

  it('does not report a lane the move never reaches', () => {
    const lanes = [{ afterSpaceIndex: 20, effect: 'BONUS_2000' as const }];
    expect(crossedLanes(4, 3, 31, lanes)).toEqual([]);
  });

  it('handles wraparound past the end of the board', () => {
    const lanes = [{ afterSpaceIndex: 30, effect: 'BONUS_2000' as const }];
    expect(crossedLanes(29, 3, 31, lanes)).toEqual(lanes);
  });
});

describe('computeNightlyRent', () => {
  it('uses the buildingsBuilt row', () => {
    const lot = baseLot({ buildingsBuilt: 2 });
    expect(computeNightlyRent(lot, 3)).toBe(1050); // Waikiki, 2 buildings, 3 nights
  });

  it('uses the garden row instead when hasGarden is true', () => {
    const lot = baseLot({ buildingsBuilt: 5, hasGarden: true });
    expect(computeNightlyRent(lot, 1)).toBe(1000); // Waikiki garden row, not the 5-building row (650)
  });
});

describe('computeConstructionCost', () => {
  it('sums only the newly-built buildings, not already-built ones', () => {
    const lot = baseLot({ buildingsBuilt: 1 });
    // Waikiki buildingPrices: [3500, 2500, 2500, 1750, 1750] — building 2 more from index 1: 2500+2500
    expect(computeConstructionCost(lot, { lotId: 'waikiki', buildingCount: 2 })).toBe(5000);
  });

  it('adds the garden price when buildGarden is requested', () => {
    const lot = baseLot({ buildingsBuilt: 0 });
    expect(computeConstructionCost(lot, { lotId: 'waikiki', buildingCount: 0, buildGarden: true })).toBe(2500);
  });
});

describe('computeHotelValue / computeAuctionOpeningBid', () => {
  it('matches the spec example: 500 lot + 1000 building -> bank offers 750', () => {
    const boomerangConfig = HOTEL_CONFIGS.find((c) => c.id === 'boomerang')!;
    const lot = baseLot({ ...boomerangConfig, buildingsBuilt: 0, lotPrice: 500, buildingPrices: [1000] });
    expect(computeHotelValue(lot)).toBe(500);
    const built = { ...lot, buildingsBuilt: 1 };
    expect(computeHotelValue(built)).toBe(1500);
    expect(computeAuctionOpeningBid(built)).toBe(750);
  });
});

describe('canForceBuyFromOwner / computeLotPurchasePrice', () => {
  it('an unbuilt, player-owned lot can be force-bought at half its lot price', () => {
    const lot = baseLot({ ownerId: 'p1', buildingsBuilt: 0, hasGarden: false });
    expect(canForceBuyFromOwner(lot)).toBe(true);
    expect(computeLotPurchasePrice(lot)).toBe(Math.floor(waikikiConfig.lotPrice / 2));
  });

  it('a built-up, player-owned lot can NOT be force-bought', () => {
    const lot = baseLot({ ownerId: 'p1', buildingsBuilt: 1 });
    expect(canForceBuyFromOwner(lot)).toBe(false);
  });

  it('a bank-owned lot uses lotPrice unless it has a bankBuybackPrice', () => {
    expect(computeLotPurchasePrice(baseLot())).toBe(waikikiConfig.lotPrice);
    expect(computeLotPurchasePrice(baseLot({ bankBuybackPrice: 750 }))).toBe(750);
  });
});

describe('getNextConstructionStep — enforces buildings-before-garden order', () => {
  it('offers the next building while any remain unbuilt', () => {
    const lot = baseLot({ buildingsBuilt: 1 }); // waikiki has 5 buildingPrices
    expect(getNextConstructionStep(lot, 0, false)).toEqual({ lotId: 'waikiki', buildingCount: 1, buildGarden: false });
  });

  it('accounts for buildings already picked earlier this session', () => {
    const lot = baseLot({ buildingsBuilt: 3 });
    expect(getNextConstructionStep(lot, 1, false)).toEqual({ lotId: 'waikiki', buildingCount: 2, buildGarden: false });
  });

  it('only offers the garden once every building is up', () => {
    const lot = baseLot({ buildingsBuilt: 4 }); // one building short of waikiki's 5
    expect(getNextConstructionStep(lot, 0, false)).toEqual({ lotId: 'waikiki', buildingCount: 1, buildGarden: false });
    expect(getNextConstructionStep(lot, 1, false)).toEqual({ lotId: 'waikiki', buildingCount: 1, buildGarden: true });
  });

  it('returns null once nothing is left to add', () => {
    const lot = baseLot({ buildingsBuilt: 5, hasGarden: true });
    expect(getNextConstructionStep(lot, 0, false)).toBeNull();
  });
});

describe('isValidConstructionPlan — rejects an out-of-order plan', () => {
  function stateWithOwnedLot(): HotelState {
    let state = createInitialState(['Alice', 'Bob']);
    state = updateLot(state, 'waikiki', { ownerId: 'player-1', buildingsBuilt: 2 }); // 3 of 5 buildings still missing
    return state;
  }

  it('accepts a plan that only adds buildings', () => {
    const state = stateWithOwnedLot();
    expect(isValidConstructionPlan(state, 'player-1', [{ lotId: 'waikiki', buildingCount: 1, buildGarden: false }])).toBe(
      true,
    );
  });

  it('accepts a plan that finishes every building and adds the garden in one go', () => {
    const state = stateWithOwnedLot();
    const plan = [{ lotId: 'waikiki', buildingCount: 3, buildGarden: true }];
    expect(isValidConstructionPlan(state, 'player-1', plan)).toBe(true);
  });

  it('rejects requesting the garden before every building is up — the bug the UI used to allow', () => {
    const state = stateWithOwnedLot();
    const plan = [{ lotId: 'waikiki', buildingCount: 1, buildGarden: true }]; // 2 buildings would still be missing
    expect(isValidConstructionPlan(state, 'player-1', plan)).toBe(false);
  });

  it('rejects a no-op item (neither a building nor the garden)', () => {
    const state = stateWithOwnedLot();
    const plan = [{ lotId: 'waikiki', buildingCount: 0, buildGarden: false }];
    expect(isValidConstructionPlan(state, 'player-1', plan)).toBe(false);
  });
});

describe('isGardenOnlyPlan / canBuildWithoutPermit — a garden-only plan skips the permit-die risk', () => {
  function stateWithFullyBuiltWaikiki(): HotelState {
    let state = createInitialState(['Alice', 'Bob']);
    state = updateLot(state, 'waikiki', { ownerId: 'player-1', buildingsBuilt: waikikiConfig.buildingPrices.length });
    state = updatePlayer(state, 'player-1', { position: 16 }); // space-17: CONSTRUCTION [royal, waikiki]
    return { ...state, turnPhase: 'RESOLVING_SPACE' as const };
  }

  it('isGardenOnlyPlan is true only when every item is garden-with-no-buildings', () => {
    expect(isGardenOnlyPlan([{ lotId: 'waikiki', buildingCount: 0, buildGarden: true }])).toBe(true);
    expect(isGardenOnlyPlan([{ lotId: 'waikiki', buildingCount: 1, buildGarden: false }])).toBe(false);
    expect(isGardenOnlyPlan([{ lotId: 'waikiki', buildingCount: 1, buildGarden: true }])).toBe(false);
    expect(isGardenOnlyPlan([])).toBe(false);
  });

  it('allows building the garden without a permit once every building is up', () => {
    const state = stateWithFullyBuiltWaikiki();
    const plan = [{ lotId: 'waikiki', buildingCount: 0, buildGarden: true }];
    expect(canBuildWithoutPermit(state, 'player-1', plan)).toBe(true);
  });

  it('refuses a plan that also requests a building — that still needs the permit die', () => {
    const state = createInitialState(['Alice', 'Bob']);
    let next = updateLot(state, 'waikiki', { ownerId: 'player-1', buildingsBuilt: 2 });
    next = updatePlayer(next, 'player-1', { position: 16 });
    next = { ...next, turnPhase: 'RESOLVING_SPACE' };
    const plan = [{ lotId: 'waikiki', buildingCount: waikikiConfig.buildingPrices.length - 2, buildGarden: true }];
    expect(canBuildWithoutPermit(next, 'player-1', plan)).toBe(false);
  });

  it('refuses off a construction space / outside RESOLVING_SPACE, same as canStartConstruction', () => {
    const state = createInitialState(['Alice', 'Bob']);
    const plan = [{ lotId: 'waikiki', buildingCount: 0, buildGarden: true }];
    expect(canBuildWithoutPermit(state, 'player-1', plan)).toBe(false);
  });
});

describe('canBuyLot / canStartConstruction — action legality mirrors what the reducer enforces', () => {
  it('is false off a Purchase space, true once standing on one with a buyable lot', () => {
    const state = createInitialState(['Alice', 'Bob']);
    expect(canBuyLot(state, 'fujiyama')).toBe(false); // still AWAITING_ROLL, not even resolved onto a space
    const onPurchaseSpace = { ...updatePlayer(state, 'player-1', { position: 2 }), turnPhase: 'RESOLVING_SPACE' as const };
    expect(canBuyLot(onPurchaseSpace, 'fujiyama')).toBe(true);
  });

  it('is false once construction is locked for the turn even with eligible lots', () => {
    let state = createInitialState(['Alice', 'Bob']);
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1' });
    state = updatePlayer(state, 'player-1', { position: 1 }); // space-2: CONSTRUCTION [fujiyama]
    state = { ...state, turnPhase: 'RESOLVING_SPACE', constructionLockedThisTurn: true };
    expect(canStartConstruction(state)).toBe(false);
  });
});

describe('canBuyStaircaseRight — the player picks the space, not just the lot', () => {
  function stateWithRightActive(): HotelState {
    const state = updateLot(createInitialState(['Alice', 'Bob']), 'fujiyama', { ownerId: 'player-1' });
    // Realistic phase — the right only ever activates from within
    // applyRollMoveDice, which always leaves turnPhase at RESOLVING_SPACE (or
    // a more specific awaiting-phase) by the time a player can act on it.
    return { ...state, staircasePurchaseRightActive: true, turnPhase: 'RESOLVING_SPACE' };
  }

  it('is false when the right is not active, even on an owned lot', () => {
    const state = updateLot(createInitialState(['Alice', 'Bob']), 'fujiyama', { ownerId: 'player-1' });
    expect(canBuyStaircaseRight(state, 'fujiyama', 'space-2')).toBe(false);
  });

  it('is true for any space adjacent to the owned lot while the right is active', () => {
    const state = stateWithRightActive();
    expect(canBuyStaircaseRight(state, 'fujiyama', 'space-2')).toBe(true); // CONSTRUCTION [fujiyama]
    expect(canBuyStaircaseRight(state, 'fujiyama', 'space-3')).toBe(true); // PURCHASE [fujiyama, boomerang]
  });

  it('is false for a space not adjacent to the chosen lot', () => {
    const state = stateWithRightActive();
    expect(canBuyStaircaseRight(state, 'fujiyama', 'space-9')).toBe(false); // PURCHASE [letoile] only
  });

  it('is false for a space that already has a staircase', () => {
    const state = updateSpace(stateWithRightActive(), 'space-2', { staircaseForLotId: 'fujiyama' });
    expect(canBuyStaircaseRight(state, 'fujiyama', 'space-2')).toBe(false);
  });

  it("is false for a lot the player doesn't own", () => {
    const state = { ...createInitialState(['Alice', 'Bob']), staircasePurchaseRightActive: true };
    expect(canBuyStaircaseRight(state, 'fujiyama', 'space-2')).toBe(false); // still bank-owned
  });

  it('is false once already purchased for that lot this turn', () => {
    const state = { ...stateWithRightActive(), lotsWithStaircasePurchasedThisTurn: ['fujiyama'] };
    expect(canBuyStaircaseRight(state, 'fujiyama', 'space-2')).toBe(false);
  });

  it("is false when the player can't afford the staircase price", () => {
    const state = updatePlayer(stateWithRightActive(), 'player-1', { cash: 0 });
    expect(canBuyStaircaseRight(state, 'fujiyama', 'space-2')).toBe(false);
  });

  it('is false once an auction/debt-resolution interrupts the turn, even though staircasePurchaseRightActive itself stays true until finishTurn (real playtest bug, 2026-07-30)', () => {
    const state = { ...stateWithRightActive(), turnPhase: 'AUCTION_IN_PROGRESS' as const };
    expect(canBuyStaircaseRight(state, 'fujiyama', 'space-2')).toBe(false);
  });
});

describe('getFreeStaircaseCandidates / canChooseFreeStaircaseSpace', () => {
  it('lists every (lot, space) pair across all owned lots with room', () => {
    let state = createInitialState(['Alice', 'Bob']);
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1' }); // adjacent to space-2, space-3, space-4, space-5, space-6, space-7
    const candidates = getFreeStaircaseCandidates(state, 'player-1');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.lotId === 'fujiyama')).toBe(true);
  });

  it('returns nothing for a player who owns no lots', () => {
    const state = createInitialState(['Alice', 'Bob']);
    expect(getFreeStaircaseCandidates(state, 'player-1')).toEqual([]);
  });

  it('excludes a lot with no available adjacent space left', () => {
    let state = createInitialState(['Alice', 'Bob']);
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1' });
    // Occupy every fujiyama-adjacent space with a staircase (for other lots, just to fill the slot).
    for (const space of state.board.filter((s) => s.adjacentLotIds.includes('fujiyama'))) {
      state = updateSpace(state, space.id, { staircaseForLotId: 'fujiyama' });
    }
    expect(getFreeStaircaseCandidates(state, 'player-1')).toEqual([]);
  });

  it('canChooseFreeStaircaseSpace requires the AWAITING_FREE_STAIRCASE_CHOICE phase', () => {
    let state = createInitialState(['Alice', 'Bob']);
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1' });
    expect(canChooseFreeStaircaseSpace(state, 'fujiyama', 'space-2')).toBe(false); // still AWAITING_ROLL
    state = { ...state, turnPhase: 'AWAITING_FREE_STAIRCASE_CHOICE' };
    expect(canChooseFreeStaircaseSpace(state, 'fujiyama', 'space-2')).toBe(true);
  });

  it("canChooseFreeStaircaseSpace rejects a lot the player doesn't own", () => {
    const state: HotelState = { ...createInitialState(['Alice', 'Bob']), turnPhase: 'AWAITING_FREE_STAIRCASE_CHOICE' };
    expect(canChooseFreeStaircaseSpace(state, 'fujiyama', 'space-2')).toBe(false);
  });
});

describe('canPlaceBid / canPassBid', () => {
  function auctionState(): HotelState {
    const state = createInitialState(['Alice', 'Bob', 'Carol']);
    return {
      ...state,
      turnPhase: 'AUCTION_IN_PROGRESS',
      pendingAuction: {
        lotId: 'boomerang',
        auctioneerId: 'player-1',
        highestBid: 1000,
        highestBidderId: null,
        passedPlayerIds: [],
        currentBidderId: 'player-2',
      },
    };
  }

  it('allows an eligible bidder to raise the highest bid, affordably', () => {
    expect(canPlaceBid(auctionState(), 'player-2', 1100)).toBe(true);
  });

  it('rejects a bid that does not exceed the current highest bid', () => {
    expect(canPlaceBid(auctionState(), 'player-2', 1000)).toBe(false);
  });

  it('rejects a bid the bidder cannot afford', () => {
    const state = updatePlayer(auctionState(), 'player-2', { cash: 500 });
    expect(canPlaceBid(state, 'player-2', 1100)).toBe(false);
  });

  it('rejects the auctioneer bidding on their own auction', () => {
    expect(canPlaceBid(auctionState(), 'player-1', 1100)).toBe(false);
  });

  it('rejects bidding/passing again once a bidder has already passed', () => {
    const state: HotelState = {
      ...auctionState(),
      pendingAuction: {
        lotId: 'boomerang',
        auctioneerId: 'player-1',
        highestBid: 1000,
        highestBidderId: null,
        passedPlayerIds: ['player-2'],
        currentBidderId: 'player-3',
      },
    };
    expect(canPlaceBid(state, 'player-2', 1100)).toBe(false);
    expect(canPassBid(state, 'player-2')).toBe(false);
  });

  it('allows the current bidder (first in seat-order rotation) to pass', () => {
    expect(canPassBid(auctionState(), 'player-2')).toBe(true);
  });

  it("rejects an eligible bidder acting out of turn, before it's their turn in the rotation (2026-08-04 redesign — bidding is strictly sequential)", () => {
    expect(canPassBid(auctionState(), 'player-3')).toBe(false);
    expect(canPlaceBid(auctionState(), 'player-3', 1100)).toBe(false);
  });
});
