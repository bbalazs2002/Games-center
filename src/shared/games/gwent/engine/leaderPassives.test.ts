import { describe, expect, it } from 'vitest';
import {
  agileAutoOptimizes,
  isLeaderAbilityCanceled,
  isLeaderAutoHornRow,
  leaderAbilityCanceledByOpponent,
  medicPicksRandomTarget,
  spyPowerMultiplier,
} from './leaderPassives';
import { updatePlayer } from './rules';
import { baseTestState, PLAYER_1, PLAYER_2 } from './testHelpers';
import {
  EMHYR_INVADER_OF_THE_NORTH,
  EMHYR_THE_WHITE_FLAME,
  EREDIN_BREACC_GLAS_THE_TREACHEROUS,
  EREDIN_KING_OF_THE_WILD_HUNT,
  FOLTEST_THE_SIEGEMASTER,
  FRANCESCA_HOPE_OF_THE_AEN_SEIDHE,
} from './leaderConstants';

/**
 * Real playtest correction (2026-08-08): Emhyr The White Flame was
 * miscategorized as a Category A one-shot — it's actually passive and
 * always-on, canceling the OPPONENT's entire leader ability (any category)
 * for the whole match, no activation needed. These tests cover the shared
 * choke point (`isLeaderAbilityCanceled`/`leaderAbilityCanceledByOpponent`)
 * plus every existing Category B passive that now has to route through it.
 * The category A (one-shot) and C (match-start) interactions are covered in
 * leaderAbilities.test.ts and initialState.test.ts respectively.
 */

describe('isLeaderAbilityCanceled / leaderAbilityCanceledByOpponent', () => {
  it('is canceled only when the OPPONENT specifically has White Flame', () => {
    expect(isLeaderAbilityCanceled('anything', EMHYR_THE_WHITE_FLAME)).toBe(true);
    expect(isLeaderAbilityCanceled('anything', FOLTEST_THE_SIEGEMASTER)).toBe(false);
    expect(isLeaderAbilityCanceled(EMHYR_THE_WHITE_FLAME, 'anything')).toBe(false); // having White Flame yourself doesn't cancel YOUR OWN ability
  });

  it('leaderAbilityCanceledByOpponent reads both players\' leaderId off the real GwentState', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { leaderId: FOLTEST_THE_SIEGEMASTER });
    state = updatePlayer(state, PLAYER_2, { leaderId: EMHYR_THE_WHITE_FLAME });
    expect(leaderAbilityCanceledByOpponent(state, PLAYER_1)).toBe(true);
    expect(leaderAbilityCanceledByOpponent(state, PLAYER_2)).toBe(false); // White Flame's own owner isn't self-canceled
  });
});

describe('isLeaderAutoHornRow — canceled by the opponent\'s White Flame', () => {
  it('grants the auto-Horn row normally, but not when the opponent has White Flame', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { leaderId: FOLTEST_THE_SIEGEMASTER }); // auto-Horn on Siege
    expect(isLeaderAutoHornRow(state, PLAYER_1, 'Siege')).toBe(true);

    const canceled = updatePlayer(state, PLAYER_2, { leaderId: EMHYR_THE_WHITE_FLAME });
    expect(isLeaderAutoHornRow(canceled, PLAYER_1, 'Siege')).toBe(false);
  });
});

describe('spyPowerMultiplier — canceled by the opponent\'s White Flame', () => {
  it('doubles Spy power normally, but not when the Breacc Glas player\'s opponent has White Flame', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { leaderId: EREDIN_BREACC_GLAS_THE_TREACHEROUS });
    expect(spyPowerMultiplier(state)).toBe(2);

    const canceled = updatePlayer(state, PLAYER_2, { leaderId: EMHYR_THE_WHITE_FLAME });
    expect(spyPowerMultiplier(canceled)).toBe(1);
  });
});

describe('medicPicksRandomTarget — canceled by the opponent\'s White Flame', () => {
  it('forces a random Medic target normally, but not when the Invader of the North player\'s opponent has White Flame', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { leaderId: EMHYR_INVADER_OF_THE_NORTH });
    expect(medicPicksRandomTarget(state)).toBe(true);

    const canceled = updatePlayer(state, PLAYER_2, { leaderId: EMHYR_THE_WHITE_FLAME });
    expect(medicPicksRandomTarget(canceled)).toBe(false);
  });
});

describe('agileAutoOptimizes — canceled by the opponent\'s White Flame', () => {
  it('auto-optimizes Agile placement normally, but not when the player\'s own opponent has White Flame', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { leaderId: FRANCESCA_HOPE_OF_THE_AEN_SEIDHE });
    expect(agileAutoOptimizes(state, PLAYER_1)).toBe(true);

    const canceled = updatePlayer(state, PLAYER_2, { leaderId: EMHYR_THE_WHITE_FLAME });
    expect(agileAutoOptimizes(canceled, PLAYER_1)).toBe(false);
  });

  it('is false for a leader that never had the ability in the first place', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { leaderId: EREDIN_KING_OF_THE_WILD_HUNT });
    expect(agileAutoOptimizes(state, PLAYER_1)).toBe(false);
  });
});
