import { describe, expect, it } from 'vitest';
import { createInitialState } from './initialState';
import { updateLot, updatePlayer } from './rules';
import { getValidActions } from './selectors';

describe('getValidActions', () => {
  it('only offers ROLL_MOVE_DICE at the very start of a turn', () => {
    const state = createInitialState(['Alice', 'Bob']);
    const valid = getValidActions(state);
    expect(valid.canRollMoveDice).toBe(true);
    expect(valid.buyableLots).toEqual([]);
    expect(valid.canStartConstruction).toBe(false);
    expect(valid.canRollNights).toBe(false);
    expect(valid.canEndTurn).toBe(false);
    expect(valid.canForfeit).toBe(true); // forfeiting is allowed any time outside an auction
  });

  it('lists the buyable lots when standing on a Purchase space', () => {
    let state = createInitialState(['Alice', 'Bob']);
    state = { ...updatePlayer(state, 'player-1', { position: 2 }), turnPhase: 'RESOLVING_SPACE' }; // space-3: PURCHASE [fujiyama, boomerang]
    const valid = getValidActions(state);
    expect(valid.buyableLots.map((lot) => lot.id).sort()).toEqual(['boomerang', 'fujiyama']);
  });

  it('excludes a lot the current player already owns from buyableLots', () => {
    let state = createInitialState(['Alice', 'Bob']);
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1' });
    state = { ...updatePlayer(state, 'player-1', { position: 2 }), turnPhase: 'RESOLVING_SPACE' };
    const valid = getValidActions(state);
    expect(valid.buyableLots.map((lot) => lot.id)).toEqual(['boomerang']);
  });

  it('offers each eligible lot its next construction step, priced at just that step', () => {
    let state = createInitialState(['Alice', 'Bob']);
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1', buildingsBuilt: 1 });
    state = { ...updatePlayer(state, 'player-1', { position: 1 }), turnPhase: 'RESOLVING_SPACE' }; // space-2: CONSTRUCTION [fujiyama]
    const valid = getValidActions(state);
    expect(valid.canStartConstruction).toBe(true);
    expect(valid.constructionOptions).toEqual([
      { lotId: 'fujiyama', nextStep: { lotId: 'fujiyama', buildingCount: 1, buildGarden: false }, cost: 1400 },
    ]);
  });

  it('lists auctionable lots and enables canStartAuction while in debt', () => {
    let state = createInitialState(['Alice', 'Bob']);
    state = updateLot(state, 'boomerang', { ownerId: 'player-1' });
    state = { ...state, turnPhase: 'AWAITING_DEBT_RESOLUTION', pendingDebt: { amount: 500, creditorId: 'player-2' } };
    const valid = getValidActions(state);
    expect(valid.canStartAuction).toBe(true);
    expect(valid.auctionableLots.map((lot) => lot.id)).toEqual(['boomerang']);
    expect(valid.canBid).toBe(false);
  });

  it('also enables canStartAuction voluntarily, mid-turn with no debt at all (2026-08-04 redesign)', () => {
    let state = createInitialState(['Alice', 'Bob']);
    state = updateLot(state, 'boomerang', { ownerId: 'player-1' });
    state = { ...state, turnPhase: 'RESOLVING_SPACE' };
    const valid = getValidActions(state);
    expect(valid.canStartAuction).toBe(true);
    expect(valid.auctionableLots.map((lot) => lot.id)).toEqual(['boomerang']);
  });

  it('keeps canStartAuction false for an owner-less player, even in RESOLVING_SPACE — never an enabled-but-dead-end option (same reasoning as the 2026-07-31 debt-auction fix)', () => {
    const state = { ...createInitialState(['Alice', 'Bob']), turnPhase: 'RESOLVING_SPACE' as const };
    const valid = getValidActions(state);
    expect(valid.canStartAuction).toBe(false);
    expect(valid.auctionableLots).toEqual([]);
  });

  it('exposes the remaining bidders, whose turn it is, and the minimum legal bid amount during an auction', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol']);
    state = {
      ...state,
      turnPhase: 'AUCTION_IN_PROGRESS',
      pendingAuction: {
        lotId: 'boomerang',
        auctioneerId: 'player-1',
        highestBid: 500,
        highestBidderId: null,
        passedPlayerIds: ['player-2'],
        currentBidderId: 'player-3',
      },
    };
    const valid = getValidActions(state);
    expect(valid.canBid).toBe(true);
    expect(valid.remainingBidderIds).toEqual(['player-3']);
    expect(valid.currentBidderId).toBe('player-3');
    expect(valid.minimumBidAmount).toBe(501);
  });
});
