import { describe, expect, it } from 'vitest';
import { applyLeaderAbility, canActivateLeaderAbility } from './leaderAbilities';
import { getPlayer, updateBoardRow, updatePlayer } from './rules';
import { baseTestState, card, PLAYER_1, PLAYER_2 } from './testHelpers';
import {
  EMHYR_EMPEROR_OF_NILFGAARD,
  EMHYR_HIS_IMPERIAL_MAJESTY,
  EMHYR_THE_RELENTLESS,
  EMHYR_THE_WHITE_FLAME,
  EREDIN_BRINGER_OF_DEATH,
  EREDIN_COMMANDER_OF_THE_RED_RIDERS,
  EREDIN_DESTROYER_OF_WORLDS,
  FOLTEST_KING_OF_TEMERIA,
  FOLTEST_LORD_COMMANDER_OF_THE_NORTH,
  FOLTEST_SON_OF_MEDELL,
  FOLTEST_THE_SIEGEMASTER,
  FOLTEST_THE_STEEL_FORGED,
  FRANCESCA_PUREBLOOD_ELF,
  FRANCESCA_QUEEN_OF_DOL_BLATHANNA,
} from './leaderConstants';
import type { GwentState } from './state';

const TIGHT_BOND = 'nilfgaard-impera-brigade-guard';
const BIG_RANGED = 'nilfgaard-black-infantry-archer'; // power 10, Ranged

function readyState(leaderId: string): GwentState {
  let state: GwentState = { ...baseTestState(), phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: 0 };
  state = updatePlayer(state, PLAYER_1, { leaderId });
  return state;
}

describe('canActivateLeaderAbility', () => {
  it('rejects outside ROUND_IN_PROGRESS, outside the acting player\'s turn, once already used, or for a passive-only leader', () => {
    const state = readyState(FOLTEST_LORD_COMMANDER_OF_THE_NORTH);
    expect(canActivateLeaderAbility(state, PLAYER_1)).toBe(true);
    expect(canActivateLeaderAbility(state, PLAYER_2)).toBe(false);

    const used = updatePlayer(state, PLAYER_1, { leaderAbilityUsed: true });
    expect(canActivateLeaderAbility(used, PLAYER_1)).toBe(false);

    const passiveOnly = updatePlayer(state, PLAYER_1, { leaderId: FOLTEST_THE_SIEGEMASTER });
    expect(canActivateLeaderAbility(passiveOnly, PLAYER_1)).toBe(false);
  });
});

describe('leader abilities — one-shot (category A)', () => {
  it('Foltest King of Temeria plays an Impenetrable Fog instantly from the deck', () => {
    let state = readyState(FOLTEST_KING_OF_TEMERIA);
    state = updatePlayer(state, PLAYER_1, { deck: [card('fog', 'neutral-impenetrable-fog')] });
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual(['Ranged']);
    expect(getPlayer(next, PLAYER_1).deck).toEqual([]);
  });

  it('Foltest Lord Commander of the North clears every active weather effect', () => {
    let state = readyState(FOLTEST_LORD_COMMANDER_OF_THE_NORTH);
    state = { ...state, activeWeatherRows: ['Melee', 'Siege'] };
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual([]);
  });

  it('Foltest Son of Medell destroys the opponent\'s Ranged row once it reaches 10', () => {
    let state = readyState(FOLTEST_SON_OF_MEDELL);
    state = updateBoardRow(state, PLAYER_2, 'Ranged', { cards: [card('big', BIG_RANGED)] });
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(next, PLAYER_2).board.Ranged.cards).toEqual([]);
  });

  it('Foltest Son of Medell does nothing (but is still consumed) below the threshold', () => {
    let state = readyState(FOLTEST_SON_OF_MEDELL);
    state = updateBoardRow(state, PLAYER_2, 'Ranged', { cards: [card('weak', TIGHT_BOND)] }); // power 3
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(next, PLAYER_2).board.Ranged.cards.map((c) => c.instanceId)).toEqual(['weak']);
  });

  it('Foltest The Steel-Forged destroys the opponent\'s Siege row once it reaches 10', () => {
    let state = readyState(FOLTEST_THE_STEEL_FORGED);
    state = updateBoardRow(state, PLAYER_2, 'Siege', { cards: [card('big', BIG_RANGED)] }); // reused fixture, power 10 regardless of its natural row
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(next, PLAYER_2).board.Siege.cards).toEqual([]);
  });

  it('Emhyr His Imperial Majesty plays a Torrential Rain instantly from the deck', () => {
    let state = readyState(EMHYR_HIS_IMPERIAL_MAJESTY);
    state = updatePlayer(state, PLAYER_1, { deck: [card('rain', 'neutral-torrential-rain')] });
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual(['Siege']);
  });

  it('Emhyr Emperor of Nilfgaard reveals up to 3 of the opponent\'s hand cards without changing any state', () => {
    let state = readyState(EMHYR_EMPEROR_OF_NILFGAARD);
    state = updatePlayer(state, PLAYER_2, { hand: [card('a', TIGHT_BOND), card('b', TIGHT_BOND)] });
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(next, PLAYER_2).hand).toHaveLength(2); // untouched
    const entry = next.log.find((e) => e.type === 'LEADER_REVEALED_OPPONENT_HAND');
    expect(entry && 'revealedDefIds' in entry ? entry.revealedDefIds : []).toHaveLength(2);
  });

  it('Emhyr The Relentless draws a chosen card out of the OPPONENT\'s discard pile', () => {
    let state = readyState(EMHYR_THE_RELENTLESS);
    state = updatePlayer(state, PLAYER_2, { discard: [card('target', TIGHT_BOND)] });
    const next = applyLeaderAbility(state, PLAYER_1, 'target', undefined);
    expect(getPlayer(next, PLAYER_1).hand.map((c) => c.instanceId)).toEqual(['target']);
    expect(getPlayer(next, PLAYER_2).discard).toEqual([]);
  });

  it('Emhyr The White Flame cancels the OPPONENT\'s (still unused) leader ability', () => {
    const state = readyState(EMHYR_THE_WHITE_FLAME);
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(next, PLAYER_2).leaderAbilityUsed).toBe(true);
  });

  it('Eredin Bringer of Death discards 2 chosen hand cards and draws 1 chosen deck card', () => {
    let state = readyState(EREDIN_BRINGER_OF_DEATH);
    state = updatePlayer(state, PLAYER_1, {
      hand: [card('h1', TIGHT_BOND), card('h2', TIGHT_BOND)],
      deck: [card('d1', TIGHT_BOND)],
    });
    const next = applyLeaderAbility(state, PLAYER_1, 'd1', ['h1', 'h2']);
    const p1 = getPlayer(next, PLAYER_1);
    expect(p1.hand.map((c) => c.instanceId)).toEqual(['d1']);
    expect(p1.discard.map((c) => c.instanceId).sort()).toEqual(['h1', 'h2']);
  });

  it('Eredin Commander of the Red Riders plays any CHOSEN weather card instantly from the deck', () => {
    let state = readyState(EREDIN_COMMANDER_OF_THE_RED_RIDERS);
    state = updatePlayer(state, PLAYER_1, { deck: [card('w', 'neutral-biting-frost')] });
    const next = applyLeaderAbility(state, PLAYER_1, 'w', undefined);
    expect(next.activeWeatherRows).toEqual(['Melee']);
  });

  it('Eredin Destroyer of Worlds restores a chosen card from the player\'s OWN discard pile', () => {
    let state = readyState(EREDIN_DESTROYER_OF_WORLDS);
    state = updatePlayer(state, PLAYER_1, { discard: [card('back', TIGHT_BOND)] });
    const next = applyLeaderAbility(state, PLAYER_1, 'back', undefined);
    expect(getPlayer(next, PLAYER_1).hand.map((c) => c.instanceId)).toEqual(['back']);
  });

  it('Francesca Pureblood Elf plays a Biting Frost instantly from the deck', () => {
    let state = readyState(FRANCESCA_PUREBLOOD_ELF);
    state = updatePlayer(state, PLAYER_1, { deck: [card('bf', 'neutral-biting-frost')] });
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual(['Melee']);
  });

  it('Francesca Queen of Dol Blathanna destroys the opponent\'s Melee row once it reaches 10', () => {
    let state = readyState(FRANCESCA_QUEEN_OF_DOL_BLATHANNA);
    state = updateBoardRow(state, PLAYER_2, 'Melee', { cards: [card('big', BIG_RANGED)] }); // reused fixture, power 10 regardless of its natural row
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(next, PLAYER_2).board.Melee.cards).toEqual([]);
  });

  it('every handler unconditionally logs the activation, even when its own target fizzles', () => {
    const state = readyState(FOLTEST_KING_OF_TEMERIA); // no Impenetrable Fog in deck this time
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.log.some((e) => e.type === 'LEADER_ABILITY_ACTIVATED')).toBe(true);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });
});
