import { describe, expect, it } from 'vitest';
import { HOTEL_CONFIGS } from './hotelConfigs';
import { createInitialState } from './initialState';
import { reducer } from './reducer';
import { getLot, getPlayer, updateLot, updatePlayer, updateSpace } from './rules';
import { PARKING_POSITION, type HotelState } from './state';

const fujiyamaStaircasePrice = HOTEL_CONFIGS.find((c) => c.id === 'fujiyama')!.staircasePrice;

function twoPlayerState(): HotelState {
  return createInitialState(['Alice', 'Bob']);
}

describe('createInitialState', () => {
  it('starts both players in the parkoló (not on the board yet) with the same cash, player 1 to move', () => {
    const state = twoPlayerState();
    expect(state.players).toHaveLength(2);
    expect(state.players.every((p) => p.position === PARKING_POSITION && !p.bankrupt)).toBe(true);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.turnPhase).toBe('AWAITING_ROLL');
    expect(state.lots).toHaveLength(8);
    expect(state.lots.every((l) => l.ownerId === null)).toBe(true);
  });
});

describe('reducer — ROLL_MOVE_DICE', () => {
  it('moves the current player and enters RESOLVING_SPACE on a Purchase space', () => {
    const state = twoPlayerState();
    // From the parkoló (PARKING_POSITION), a roll of N lands on board index N-1.
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 });
    expect(getPlayer(next, 'player-1').position).toBe(2); // space-3, PURCHASE
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
  });

  it('crossing the "2000" special lane pays out immediately', () => {
    const state = twoPlayerState();
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 8 }); // from the parkoló: crosses index 6 -> lands on space-8 (index 7)
    expect(getPlayer(next, 'player-1').cash).toBe(15000 + 2000);
  });

  it('landing on Start never auto-ends the turn — the player must still click "Kör vége" (real playtest report, 2026-08-01: this used to silently skip a staircase-purchase right granted in the same roll)', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 30 }); // one step from wrapping to Start
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(getPlayer(next, 'player-1').position).toBe(0);
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
    expect(next.currentPlayerIndex).toBe(0);
  });

  it('a roll that BOTH crosses the staircase-purchase-right lane AND lands on Start keeps the right active (regression, 2026-08-01)', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 25 }); // sitting exactly on the special lane
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 6 }); // wraps to index 0 = Start
    expect(getPlayer(next, 'player-1').position).toBe(0);
    expect(next.staircasePurchaseRightActive).toBe(true);
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
    expect(next.currentPlayerIndex).toBe(0);
  });

  it('is a no-op outside AWAITING_ROLL', () => {
    const state = { ...twoPlayerState(), turnPhase: 'RESOLVING_SPACE' as const };
    expect(reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 })).toBe(state);
  });

  it('pushes to the next free space when the intended landing is occupied by another player', () => {
    const state = updatePlayer(twoPlayerState(), 'player-2', { position: 2 }); // sitting on player-1's intended landing
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 }); // from the parkoló, intended index 2
    expect(getPlayer(next, 'player-1').position).toBe(3); // pushed one further
    expect(getPlayer(next, 'player-2').position).toBe(2); // player-2 doesn't move
  });

  it('still triggers a special lane crossed only during the occupied-space push', () => {
    const state = updatePlayer(twoPlayerState(), 'player-2', { position: 7 }); // blocks player-1's intended landing
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 8 }); // from the parkoló, intended index 7
    expect(getPlayer(next, 'player-1').position).toBe(8); // pushed past player-2
    expect(getPlayer(next, 'player-1').cash).toBe(15000 + 2000); // "2000" lane still applied
  });
});

describe('reducer — BUY_LOT', () => {
  function stateOnPurchaseSpace(): HotelState {
    return updatePlayer(twoPlayerState(), 'player-1', { position: 2 }); // space-3: PURCHASE [fujiyama, boomerang]
  }

  it('buys a bank-owned lot at full price', () => {
    const state = { ...stateOnPurchaseSpace(), turnPhase: 'RESOLVING_SPACE' as const };
    const next = reducer(state, { type: 'BUY_LOT', lotId: 'fujiyama' });
    expect(getLot(next, 'fujiyama').ownerId).toBe('player-1');
    expect(getPlayer(next, 'player-1').cash).toBe(15000 - 1000); // fujiyama lotPrice
  });

  it('ignores a lot not adjacent to the current space', () => {
    const state = { ...stateOnPurchaseSpace(), turnPhase: 'RESOLVING_SPACE' as const };
    const next = reducer(state, { type: 'BUY_LOT', lotId: 'waikiki' });
    expect(next).toBe(state);
  });

  it('force-buys an unbuilt lot from another player at half price, paid TO that player (not the bank)', () => {
    let state: HotelState = { ...stateOnPurchaseSpace(), turnPhase: 'RESOLVING_SPACE' as const };
    state = updateLot(state, 'fujiyama', { ownerId: 'player-2' });
    const next = reducer(state, { type: 'BUY_LOT', lotId: 'fujiyama' });
    expect(getLot(next, 'fujiyama').ownerId).toBe('player-1');
    expect(getPlayer(next, 'player-1').cash).toBe(15000 - 500); // half of 1000
    expect(getPlayer(next, 'player-2').cash).toBe(15000 + 500); // the previous owner receives it
  });

  it('refuses to buy a built-up lot from another player', () => {
    let state: HotelState = { ...stateOnPurchaseSpace(), turnPhase: 'RESOLVING_SPACE' as const };
    state = updateLot(state, 'fujiyama', { ownerId: 'player-2', buildingsBuilt: 1 });
    const next = reducer(state, { type: 'BUY_LOT', lotId: 'fujiyama' });
    expect(next).toBe(state);
  });
});

describe('reducer — construction & the building-permit die', () => {
  function stateOnConstructionSpace(): HotelState {
    let state = updatePlayer(twoPlayerState(), 'player-1', { position: 1 }); // space-2: CONSTRUCTION [fujiyama]
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1' });
    return { ...state, turnPhase: 'RESOLVING_SPACE' as const };
  }

  it('GREEN builds as planned and charges full price', () => {
    let state: HotelState = stateOnConstructionSpace();
    state = reducer(state, { type: 'START_CONSTRUCTION', plan: [{ lotId: 'fujiyama', buildingCount: 1 }] });
    expect(state.turnPhase).toBe('AWAITING_BUILDING_PERMIT');
    state = reducer(state, { type: 'ROLL_BUILDING_PERMIT', value: 'GREEN' });
    expect(getLot(state, 'fujiyama').buildingsBuilt).toBe(1);
    expect(getPlayer(state, 'player-1').cash).toBe(15000 - 2200); // fujiyama buildingPrices[0]
    expect(state.turnPhase).toBe('RESOLVING_SPACE');
  });

  it('FREE builds without any cost', () => {
    let state: HotelState = stateOnConstructionSpace();
    state = reducer(state, { type: 'START_CONSTRUCTION', plan: [{ lotId: 'fujiyama', buildingCount: 1 }] });
    state = reducer(state, { type: 'ROLL_BUILDING_PERMIT', value: 'FREE' });
    expect(getLot(state, 'fujiyama').buildingsBuilt).toBe(1);
    expect(getPlayer(state, 'player-1').cash).toBe(15000);
  });

  it('DOUBLE charges twice the price', () => {
    let state: HotelState = stateOnConstructionSpace();
    state = reducer(state, { type: 'START_CONSTRUCTION', plan: [{ lotId: 'fujiyama', buildingCount: 1 }] });
    state = reducer(state, { type: 'ROLL_BUILDING_PERMIT', value: 'DOUBLE' });
    expect(getLot(state, 'fujiyama').buildingsBuilt).toBe(1);
    expect(getPlayer(state, 'player-1').cash).toBe(15000 - 2200 * 2);
  });

  it('RED blocks the plan and locks further construction this turn', () => {
    let state: HotelState = stateOnConstructionSpace();
    state = reducer(state, { type: 'START_CONSTRUCTION', plan: [{ lotId: 'fujiyama', buildingCount: 1 }] });
    state = reducer(state, { type: 'ROLL_BUILDING_PERMIT', value: 'RED' });
    expect(getLot(state, 'fujiyama').buildingsBuilt).toBe(0);
    expect(state.constructionLockedThisTurn).toBe(true);
    expect(state.turnPhase).toBe('RESOLVING_SPACE');

    const retried = reducer(state, {
      type: 'START_CONSTRUCTION',
      plan: [{ lotId: 'fujiyama', buildingCount: 1 }],
    });
    expect(retried).toBe(state); // locked out for the rest of the turn
  });

  it('rejects a plan that requests the garden before every building is up, even sent directly (not via the wheel UI)', () => {
    const state = stateOnConstructionSpace(); // fujiyama has 0 of 4 buildings built
    const next = reducer(state, {
      type: 'START_CONSTRUCTION',
      plan: [{ lotId: 'fujiyama', buildingCount: 1, buildGarden: true }],
    });
    expect(next).toBe(state); // unchanged — the engine itself enforces build order, not just the UI
  });
});

describe('reducer — BUILD_WITHOUT_PERMIT (garden-only, no die roll)', () => {
  function stateWithFullyBuiltFujiyama(): HotelState {
    let state = updatePlayer(twoPlayerState(), 'player-1', { position: 1 }); // space-2: CONSTRUCTION [fujiyama]
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1', buildingsBuilt: 3 }); // all 3 of fujiyama's buildings up
    return { ...state, turnPhase: 'RESOLVING_SPACE' as const };
  }

  it('builds the garden immediately at full price — no AWAITING_BUILDING_PERMIT phase, no die roll', () => {
    const state = stateWithFullyBuiltFujiyama();
    const next = reducer(state, {
      type: 'BUILD_WITHOUT_PERMIT',
      plan: [{ lotId: 'fujiyama', buildingCount: 0, buildGarden: true }],
    });
    expect(getLot(next, 'fujiyama').hasGarden).toBe(true);
    expect(getPlayer(next, 'player-1').cash).toBe(15000 - 500); // fujiyama's gardenPrice
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
    expect(next.pendingConstructionPlan).toBeNull();
  });

  it('refuses a plan that also requests a building — that still needs the risky permit die', () => {
    let state = updatePlayer(twoPlayerState(), 'player-1', { position: 1 });
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1', buildingsBuilt: 2 });
    state = { ...state, turnPhase: 'RESOLVING_SPACE' };
    const next = reducer(state, {
      type: 'BUILD_WITHOUT_PERMIT',
      plan: [{ lotId: 'fujiyama', buildingCount: 1, buildGarden: true }],
    });
    expect(next).toBe(state);
  });

  it('the garden can still be built the risky way too — requesting a permit remains an option', () => {
    const state = stateWithFullyBuiltFujiyama();
    let next = reducer(state, {
      type: 'START_CONSTRUCTION',
      plan: [{ lotId: 'fujiyama', buildingCount: 0, buildGarden: true }],
    });
    expect(next.turnPhase).toBe('AWAITING_BUILDING_PERMIT');
    next = reducer(next, { type: 'ROLL_BUILDING_PERMIT', value: 'FREE' });
    expect(getLot(next, 'fujiyama').hasGarden).toBe(true);
    expect(getPlayer(next, 'player-1').cash).toBe(15000); // FREE roll — no charge at all
  });
});

describe('reducer — free spaces resolve automatically on landing (no repeatable claim action)', () => {
  it('FREE_STAIRCASE pays 100 flat if the player owns no lots', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 5 }); // one step from space-7 (index 6)
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(getPlayer(next, 'player-1').position).toBe(6);
    expect(getPlayer(next, 'player-1').cash).toBe(15000 + 100);
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
  });

  it('FREE_STAIRCASE with an eligible lot waits for the player to pick the space instead of auto-placing', () => {
    let state = updatePlayer(twoPlayerState(), 'player-1', { position: 5 });
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1' });
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(next.turnPhase).toBe('AWAITING_FREE_STAIRCASE_CHOICE');
    expect(next.board.some((s) => s.staircaseForLotId === 'fujiyama')).toBe(false);
    expect(getPlayer(next, 'player-1').cash).toBe(15000); // untouched until the choice is actually made
  });

  it('FREE_STAIRCASE pays the owned lot\'s staircase price when it has no room left and the landing space is unrelated', () => {
    let state = updatePlayer(twoPlayerState(), 'player-1', { position: 5 }); // lands on space-7, adjacent only to fujiyama
    state = updateLot(state, 'boomerang', { ownerId: 'player-1' }); // owned lot unrelated to the landing space
    // Occupy every space adjacent to boomerang so it has no room left.
    for (const space of state.board) {
      if (space.adjacentLotIds.includes('boomerang')) {
        state = updateSpace(state, space.id, { staircaseForLotId: 'boomerang' });
      }
    }
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
    expect(getPlayer(next, 'player-1').cash).toBe(15000 + getLot(next, 'boomerang').staircasePrice);
  });

  it('CHOOSE_FREE_STAIRCASE_SPACE places the staircase on the chosen space and resumes the turn', () => {
    let state = updatePlayer(twoPlayerState(), 'player-1', { position: 5 });
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1' });
    const landed = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(landed.turnPhase).toBe('AWAITING_FREE_STAIRCASE_CHOICE');

    const next = reducer(landed, { type: 'CHOOSE_FREE_STAIRCASE_SPACE', lotId: 'fujiyama', spaceId: 'space-2' });
    expect(next.board.find((s) => s.id === 'space-2')?.staircaseForLotId).toBe('fujiyama');
    expect(getPlayer(next, 'player-1').cash).toBe(15000); // free — no charge, no payout
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
  });

  it('CHOOSE_FREE_STAIRCASE_SPACE refuses a space not adjacent to the given lot', () => {
    let state = updatePlayer(twoPlayerState(), 'player-1', { position: 5 });
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1' });
    const landed = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });

    const next = reducer(landed, { type: 'CHOOSE_FREE_STAIRCASE_SPACE', lotId: 'fujiyama', spaceId: 'space-9' });
    expect(next).toBe(landed);
  });

  it('CHOOSE_FREE_STAIRCASE_SPACE is a no-op outside AWAITING_FREE_STAIRCASE_CHOICE', () => {
    const state = updateLot(twoPlayerState(), 'fujiyama', { ownerId: 'player-1' });
    const next = reducer(state, { type: 'CHOOSE_FREE_STAIRCASE_SPACE', lotId: 'fujiyama', spaceId: 'space-2' });
    expect(next).toBe(state);
  });

  it('the reward can not be re-claimed by "clicking again" (re-dispatching) after landing', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 5 });
    const afterLanding = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(afterLanding.turnPhase).toBe('RESOLVING_SPACE'); // no longer AWAITING_ROLL

    // The only thing that used to make this repeatable was a player-facing
    // button dispatching TAKE_FREE_STAIRCASE again; that action type no
    // longer exists, and re-sending the move roll is rejected outright since
    // it requires AWAITING_ROLL.
    const repeated = reducer(afterLanding, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(repeated).toBe(afterLanding);
    expect(getPlayer(repeated, 'player-1').cash).toBe(15000 + 100);
  });

  it('FREE_BUILDING does nothing if the player owns no lots', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 8 }); // one step from space-10 (index 9)
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(getPlayer(next, 'player-1').position).toBe(9);
    expect(getPlayer(next, 'player-1').cash).toBe(15000);
    expect(next.lots.every((lot) => lot.buildingsBuilt === 0)).toBe(true);
  });

  it('FREE_BUILDING picks the single most expensive buildable option across ALL owned lots, not just the first eligible one', () => {
    // president's next building tier (5000) beats fujiyama's (2200) — real
    // playtest report (2026-07-30): the player used to always get whatever
    // the FIRST owned lot happened to have next, regardless of price.
    let state = twoPlayerState();
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1', buildingsBuilt: 0, hasGarden: false });
    state = updateLot(state, 'president', { ownerId: 'player-1', buildingsBuilt: 0, hasGarden: true });
    state = updatePlayer(state, 'player-1', { position: 9 }); // one step from space-11 (index 10), FREE_BUILDING

    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(getPlayer(next, 'player-1').position).toBe(10);
    expect(getPlayer(next, 'player-1').cash).toBe(15000); // free — no charge
    expect(getLot(next, 'president').buildingsBuilt).toBe(1);
    expect(getLot(next, 'fujiyama').buildingsBuilt).toBe(0);
  });

  it(
    "FREE_BUILDING never offers the garden before every building on that lot is up — real playtest bug (2026-07-31): " +
      "an unbuilt L'etoile (garden 4000 > its own first building 3300) used to always win the \"most expensive option\" pick",
    () => {
      let state = twoPlayerState();
      state = updateLot(state, 'letoile', { ownerId: 'player-1', buildingsBuilt: 0, hasGarden: false });
      state = updatePlayer(state, 'player-1', { position: 9 }); // one step from space-11 (index 10), FREE_BUILDING

      const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
      expect(getLot(next, 'letoile').buildingsBuilt).toBe(1); // the (cheaper) first building
      expect(getLot(next, 'letoile').hasGarden).toBe(false); // NOT the garden
    },
  );

  it('FREE_BUILDING offers the garden once every building on that lot is already up', () => {
    let state = twoPlayerState();
    state = updateLot(state, 'letoile', { ownerId: 'player-1', buildingsBuilt: 5, hasGarden: false }); // fully built, garden still missing
    state = updatePlayer(state, 'player-1', { position: 9 });

    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(getLot(next, 'letoile').hasGarden).toBe(true);
  });

  it('FREE_BUILDING pays the most expensive MAIN (first) building among owned lots once nothing is left to build — never a garden price', () => {
    let state = twoPlayerState();
    // Both fully built (buildings + garden) — nothing left, the cash fallback kicks in.
    state = updateLot(state, 'letoile', { ownerId: 'player-1', buildingsBuilt: 5, hasGarden: true }); // first building 3300, garden 4000 (would win under the old, buggy rule)
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1', buildingsBuilt: 3, hasGarden: true }); // first building 2200
    state = updatePlayer(state, 'player-1', { position: 9 });

    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(getPlayer(next, 'player-1').cash).toBe(15000 + 3300); // letoile's first-building price, NOT its 4000 garden price
  });
});

describe('reducer — staircase rent (nights)', () => {
  it('charges the guest and pays the hotel owner', () => {
    let state = twoPlayerState();
    state = updateLot(state, 'fujiyama', { ownerId: 'player-2', buildingsBuilt: 2 });
    state = updateSpace(state, 'space-3', { staircaseForLotId: 'fujiyama' });
    state = updatePlayer(state, 'player-1', { position: 2 });
    state = { ...state, turnPhase: 'AWAITING_NIGHTS_ROLL', pendingNightsRollLotId: 'fujiyama' };

    const next = reducer(state, { type: 'ROLL_NIGHTS', value: 3 });
    // fujiyama, 2 buildings, 3 nights = 300
    expect(getPlayer(next, 'player-1').cash).toBe(15000 - 300);
    expect(getPlayer(next, 'player-2').cash).toBe(15000 + 300);
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
  });

  it('a player never pays rent to themself', () => {
    let state = twoPlayerState();
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1', buildingsBuilt: 2 });
    state = updatePlayer(state, 'player-1', { position: 2 });
    state = { ...state, turnPhase: 'AWAITING_NIGHTS_ROLL', pendingNightsRollLotId: 'fujiyama' };

    const next = reducer(state, { type: 'ROLL_NIGHTS', value: 3 });
    expect(getPlayer(next, 'player-1').cash).toBe(15000);
  });

  it('landing on a staircase space skips the whole nights-roll procedure when the lot has nothing built yet (rent would always be 0)', () => {
    let state = twoPlayerState();
    state = updateLot(state, 'fujiyama', { ownerId: 'player-2', buildingsBuilt: 0, hasGarden: false });
    state = updateSpace(state, 'space-3', { staircaseForLotId: 'fujiyama' });
    state = updatePlayer(state, 'player-1', { position: 1 }); // +1 roll lands on space-3

    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
    expect(next.pendingNightsRollLotId).toBeNull();
  });

  it('also skips the nights-roll procedure at a fully-built lot the landing player owns themself (rent would always be 0)', () => {
    let state = twoPlayerState();
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1', buildingsBuilt: 2 });
    state = updateSpace(state, 'space-3', { staircaseForLotId: 'fujiyama' });
    state = updatePlayer(state, 'player-1', { position: 1 }); // +1 roll lands on space-3

    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
    expect(next.pendingNightsRollLotId).toBeNull();
    expect(getPlayer(next, 'player-1').cash).toBe(15000);
  });

  it('still requires the nights roll landing on another owner\'s built-up staircase lot (unaffected by the self-owned skip)', () => {
    let state = twoPlayerState();
    state = updateLot(state, 'fujiyama', { ownerId: 'player-2', buildingsBuilt: 2 });
    state = updateSpace(state, 'space-3', { staircaseForLotId: 'fujiyama' });
    state = updatePlayer(state, 'player-1', { position: 1 }); // +1 roll lands on space-3

    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(next.turnPhase).toBe('AWAITING_NIGHTS_ROLL');
    expect(next.pendingNightsRollLotId).toBe('fujiyama');
  });

  it('skips the nights-roll procedure at a bank-owned staircase lot even if it still has buildings (e.g. after a forfeit/no-bid auction, which never resets buildingsBuilt/hasGarden)', () => {
    let state = twoPlayerState();
    state = updateLot(state, 'fujiyama', { ownerId: null, buildingsBuilt: 2 });
    state = updateSpace(state, 'space-3', { staircaseForLotId: 'fujiyama' });
    state = updatePlayer(state, 'player-1', { position: 1 }); // +1 roll lands on space-3

    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
    expect(next.pendingNightsRollLotId).toBeNull();
    expect(getPlayer(next, 'player-1').cash).toBe(15000);
  });

  it('a shortfall parks the turn in AWAITING_DEBT_RESOLUTION instead of going negative, if there is a lot to auction', () => {
    let state = twoPlayerState();
    state = updateLot(state, 'fujiyama', { ownerId: 'player-2', buildingsBuilt: 2 });
    // player-1 owns something else (royal) — there IS a lot to auction, so debt resolution is reachable.
    state = updateLot(state, 'royal', { ownerId: 'player-1' });
    state = updatePlayer(state, 'player-1', { position: 2, cash: 100 });
    state = { ...state, turnPhase: 'AWAITING_NIGHTS_ROLL', pendingNightsRollLotId: 'fujiyama' };

    const next = reducer(state, { type: 'ROLL_NIGHTS', value: 3 }); // owes 300, only has 100
    expect(next.turnPhase).toBe('AWAITING_DEBT_RESOLUTION');
    expect(next.pendingDebt).toEqual({ amount: 300, creditorId: 'player-2' });
    expect(getPlayer(next, 'player-1').cash).toBe(100); // untouched until the debt is actually resolved
  });

  it('a shortfall with NO lot to auction bankrupts the player immediately (INSOLVENT), skipping AWAITING_DEBT_RESOLUTION entirely', () => {
    let state = twoPlayerState();
    state = updateLot(state, 'fujiyama', { ownerId: 'player-2', buildingsBuilt: 2 });
    state = updatePlayer(state, 'player-1', { position: 2, cash: 100 }); // owns nothing at all
    state = { ...state, turnPhase: 'AWAITING_NIGHTS_ROLL', pendingNightsRollLotId: 'fujiyama' };

    const next = reducer(state, { type: 'ROLL_NIGHTS', value: 3 }); // owes 300, only has 100, nothing to sell
    expect(next.turnPhase).not.toBe('AWAITING_DEBT_RESOLUTION');
    expect(next.pendingDebt).toBeNull();
    const player1 = getPlayer(next, 'player-1');
    expect(player1.bankrupt).toBe(true);
    expect(player1.cash).toBe(0);
    expect(next.log).toContainEqual({ type: 'FORFEITED', playerId: 'player-1', reason: 'INSOLVENT' });
    // Only player-2 remains active in a 2-player game — the game ends immediately.
    expect(next.status).toBe('FINISHED');
    expect(next.winnerId).toBe('player-2');
  });
});

describe('reducer — BUY_STAIRCASE_RIGHT (paid staircase-purchase right)', () => {
  function stateWithRightActive(): HotelState {
    const state = updateLot(twoPlayerState(), 'fujiyama', { ownerId: 'player-1' });
    return { ...state, staircasePurchaseRightActive: true, turnPhase: 'RESOLVING_SPACE' };
  }

  it('places the staircase on the space the player picked and charges the price', () => {
    const state = stateWithRightActive();
    const next = reducer(state, { type: 'BUY_STAIRCASE_RIGHT', lotId: 'fujiyama', spaceId: 'space-2' });
    expect(getPlayer(next, 'player-1').cash).toBe(15000 - fujiyamaStaircasePrice);
    expect(next.board.find((space) => space.id === 'space-2')?.staircaseForLotId).toBe('fujiyama');
    expect(next.lotsWithStaircasePurchasedThisTurn).toEqual(['fujiyama']);
  });

  it('is a no-op when the staircase-purchase right is not currently active', () => {
    const state = updateLot(twoPlayerState(), 'fujiyama', { ownerId: 'player-1' }); // right not active
    const next = reducer(state, { type: 'BUY_STAIRCASE_RIGHT', lotId: 'fujiyama', spaceId: 'space-2' });
    expect(next).toBe(state);
  });

  it("refuses a lot the player doesn't own", () => {
    const state = { ...twoPlayerState(), staircasePurchaseRightActive: true }; // fujiyama still bank-owned
    const next = reducer(state, { type: 'BUY_STAIRCASE_RIGHT', lotId: 'fujiyama', spaceId: 'space-2' });
    expect(next).toBe(state);
  });

  it('refuses a second staircase purchase on the same lot in the same turn', () => {
    const state = reducer(stateWithRightActive(), { type: 'BUY_STAIRCASE_RIGHT', lotId: 'fujiyama', spaceId: 'space-2' });
    const next = reducer(state, { type: 'BUY_STAIRCASE_RIGHT', lotId: 'fujiyama', spaceId: 'space-7' });
    expect(next).toBe(state);
  });

  it('refuses when the player cannot afford the staircase price', () => {
    const state = updatePlayer(stateWithRightActive(), 'player-1', { cash: 0 });
    const next = reducer(state, { type: 'BUY_STAIRCASE_RIGHT', lotId: 'fujiyama', spaceId: 'space-2' });
    expect(next).toBe(state);
  });

  it('refuses a space that is not adjacent to the given lot', () => {
    const state = stateWithRightActive();
    const next = reducer(state, { type: 'BUY_STAIRCASE_RIGHT', lotId: 'fujiyama', spaceId: 'space-9' }); // adjacent to letoile, not fujiyama
    expect(next).toBe(state);
  });
});

describe('reducer — debt resolution via auction', () => {
  it('auctioning a lot raises cash that automatically pays off the debt', () => {
    let state = twoPlayerState();
    state = updateLot(state, 'boomerang', { ownerId: 'player-1', buildingsBuilt: 1 }); // value 500+1800=2300, opening bid 1150
    state = updatePlayer(state, 'player-1', { cash: 50 });
    state = { ...state, turnPhase: 'AWAITING_DEBT_RESOLUTION', pendingDebt: { amount: 900, creditorId: 'player-2' } };

    state = reducer(state, { type: 'START_AUCTION', lotId: 'boomerang' });
    expect(state.turnPhase).toBe('AUCTION_IN_PROGRESS');
    expect(state.pendingAuction?.highestBid).toBe(1150);

    // The only other player passes -> resolves at the bank's opening bid.
    state = reducer(state, { type: 'PASS_BID', bidderId: 'player-2' });

    expect(state.turnPhase).toBe('RESOLVING_SPACE');
    expect(state.pendingDebt).toBeNull();
    expect(getLot(state, 'boomerang').ownerId).toBeNull();
    expect(getLot(state, 'boomerang').bankBuybackPrice).toBe(1150);
    // 50 (starting) + 1150 (auction proceeds) - 900 (debt paid) = 300
    expect(getPlayer(state, 'player-1').cash).toBe(300);
  });

  it('a higher bid transfers ownership to the winning bidder', () => {
    let state = twoPlayerState();
    state = updateLot(state, 'boomerang', { ownerId: 'player-1', buildingsBuilt: 1 });
    state = updatePlayer(state, 'player-1', { cash: 50 });
    state = updatePlayer(state, 'player-2', { cash: 5000 });
    state = { ...state, turnPhase: 'AWAITING_DEBT_RESOLUTION', pendingDebt: { amount: 900, creditorId: null } };

    state = reducer(state, { type: 'START_AUCTION', lotId: 'boomerang' });
    state = reducer(state, { type: 'PLACE_BID', bidderId: 'player-2', amount: 2000 });
    state = reducer(state, { type: 'PASS_BID', bidderId: 'player-2' }); // already the only bidder — passing ends it

    expect(getLot(state, 'boomerang').ownerId).toBe('player-2');
    expect(getPlayer(state, 'player-2').cash).toBe(5000 - 2000);
    // 50 + 2000 (proceeds) - 900 (debt, no creditor since it was owed to the bank) = 1150
    expect(getPlayer(state, 'player-1').cash).toBe(1150);
  });
});

describe('reducer — auction bidding edge cases', () => {
  // 4 players so there are 3 ELIGIBLE bidders (everyone but the auctioneer) —
  // with only 2 total players (as in the tests above) a single pass always
  // leaves exactly 1 remaining bidder and resolves immediately, so the
  // "stays open" branch of maybeResolveAuction was never actually exercised.
  function fourPlayerDebtAuction(): HotelState {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave']);
    state = updateLot(state, 'boomerang', { ownerId: 'player-1', buildingsBuilt: 1 }); // opening bid 1150
    state = { ...state, turnPhase: 'AWAITING_DEBT_RESOLUTION', pendingDebt: { amount: 900, creditorId: null } };
    return reducer(state, { type: 'START_AUCTION', lotId: 'boomerang' });
  }

  it('stays open while more than one eligible bidder has not yet passed', () => {
    const state = fourPlayerDebtAuction();
    const next = reducer(state, { type: 'PASS_BID', bidderId: 'player-2' }); // player-3/4 still haven't acted
    expect(next.turnPhase).toBe('AUCTION_IN_PROGRESS');
    expect(next.pendingAuction?.passedPlayerIds).toEqual(['player-2']);
  });

  it('resolves once only one eligible bidder remains', () => {
    let state = fourPlayerDebtAuction();
    state = reducer(state, { type: 'PASS_BID', bidderId: 'player-2' });
    state = reducer(state, { type: 'PASS_BID', bidderId: 'player-3' });
    expect(state.turnPhase).toBe('RESOLVING_SPACE');
    expect(state.pendingAuction).toBeNull();
    expect(getLot(state, 'boomerang').bankBuybackPrice).toBe(1150); // nobody ever bid, resolves at the opening bid
  });

  it('rejects the auctioneer trying to bid on their own auction', () => {
    const state = fourPlayerDebtAuction();
    const next = reducer(state, { type: 'PLACE_BID', bidderId: 'player-1', amount: 5000 });
    expect(next).toBe(state);
  });

  it('rejects a bid that does not exceed the current highest bid', () => {
    const state = fourPlayerDebtAuction();
    const next = reducer(state, { type: 'PLACE_BID', bidderId: 'player-2', amount: 1150 }); // equals, not more
    expect(next).toBe(state);
  });

  it("rejects a bid the bidder can't afford", () => {
    const state = updatePlayer(fourPlayerDebtAuction(), 'player-2', { cash: 100 });
    const next = reducer(state, { type: 'PLACE_BID', bidderId: 'player-2', amount: 1200 });
    expect(next).toBe(state);
  });

  it('rejects a further bid/pass from someone who already passed', () => {
    const afterPass = reducer(fourPlayerDebtAuction(), { type: 'PASS_BID', bidderId: 'player-2' });
    const next = reducer(afterPass, { type: 'PLACE_BID', bidderId: 'player-2', amount: 5000 });
    expect(next).toBe(afterPass);
  });
});

describe('reducer — forfeit and win condition', () => {
  it('forfeiting sends all lots to the bank, marks the player bankrupt, and ends the game if only one player remains', () => {
    let state = twoPlayerState();
    state = updateLot(state, 'fujiyama', { ownerId: 'player-1', buildingsBuilt: 1 });
    state = { ...state, turnPhase: 'AWAITING_DEBT_RESOLUTION', pendingDebt: { amount: 99999, creditorId: null } };

    const next = reducer(state, { type: 'FORFEIT' });
    expect(getPlayer(next, 'player-1').bankrupt).toBe(true);
    expect(getLot(next, 'fujiyama').ownerId).toBeNull();
    expect(getLot(next, 'fujiyama').bankBuybackPrice).not.toBeNull();
    expect(next.status).toBe('FINISHED');
    expect(next.winnerId).toBe('player-2');
  });
});

describe('reducer — END_TURN', () => {
  it('advances to the next non-bankrupt player and resets per-turn fields', () => {
    let state = updatePlayer(twoPlayerState(), 'player-1', { position: 2 });
    state = { ...state, turnPhase: 'RESOLVING_SPACE', lastMoveRoll: 4 };
    const next = reducer(state, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.turnPhase).toBe('AWAITING_ROLL');
    expect(next.lastMoveRoll).toBeNull();
  });
});

describe('reducer — game log', () => {
  it('starts empty and records a MOVED entry on the very first roll', () => {
    const state = twoPlayerState();
    expect(state.log).toEqual([]);
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 });
    expect(next.log).toEqual([
      { type: 'MOVED', playerId: 'player-1', roll: 3, fromPosition: PARKING_POSITION, toPosition: 2 },
    ]);
  });

  it('records BONUS_2000 in addition to MOVED when a special lane is crossed', () => {
    const state = twoPlayerState();
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 8 }); // crosses the "2000" lane
    expect(next.log).toEqual([
      { type: 'MOVED', playerId: 'player-1', roll: 8, fromPosition: PARKING_POSITION, toPosition: 7 },
      { type: 'BONUS_2000', playerId: 'player-1' },
    ]);
  });

  it('is append-only — a rejected/no-op action does not add a log entry', () => {
    const state = { ...twoPlayerState(), turnPhase: 'RESOLVING_SPACE' as const };
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 }); // wrong phase, rejected
    expect(next.log).toEqual([]);
  });

  it('records LOT_BOUGHT with the actual price paid', () => {
    const state = { ...updatePlayer(twoPlayerState(), 'player-1', { position: 2 }), turnPhase: 'RESOLVING_SPACE' as const };
    const next = reducer(state, { type: 'BUY_LOT', lotId: 'fujiyama' });
    expect(next.log).toEqual([{ type: 'LOT_BOUGHT', playerId: 'player-1', lotId: 'fujiyama', price: 1000 }]);
  });

  it('records CONSTRUCTION_PERMIT_ROLLED with the resolved total cost', () => {
    let state = updatePlayer(twoPlayerState(), 'player-1', { position: 1 });
    state = { ...updateLot(state, 'fujiyama', { ownerId: 'player-1' }), turnPhase: 'RESOLVING_SPACE' };
    state = reducer(state, { type: 'START_CONSTRUCTION', plan: [{ lotId: 'fujiyama', buildingCount: 1 }] });
    const next = reducer(state, { type: 'ROLL_BUILDING_PERMIT', value: 'DOUBLE' });
    expect(next.log.at(-1)).toEqual({
      type: 'CONSTRUCTION_PERMIT_ROLLED',
      playerId: 'player-1',
      result: 'DOUBLE',
      plan: [{ lotId: 'fujiyama', buildingCount: 1 }],
      totalCost: 2200 * 2,
    });
  });

  it('records GAME_WON when the last standing player is decided', () => {
    let state = twoPlayerState();
    state = { ...state, turnPhase: 'AWAITING_DEBT_RESOLUTION', pendingDebt: { amount: 99999, creditorId: null } };
    const next = reducer(state, { type: 'FORFEIT' });
    expect(next.log).toContainEqual({ type: 'FORFEITED', playerId: 'player-1', reason: 'VOLUNTARY' });
    expect(next.log).toContainEqual({ type: 'GAME_WON', playerId: 'player-2' });
  });
});
