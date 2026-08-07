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
const WEATHER_CARD = 'neutral-biting-frost'; // any Weather-kind card, used where the specific effect doesn't matter

function readyState(leaderId: string): GwentState {
  let state: GwentState = { ...baseTestState(), phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: 0 };
  state = updatePlayer(state, PLAYER_1, { leaderId });
  return state;
}

describe('canActivateLeaderAbility — general gating', () => {
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

describe('canActivateLeaderAbility — target-aware gating (real playtest bug, 2026-08-08)', () => {
  it('deck-search abilities (Fog/Rain/Frost) stay activatable even with an empty deck — the client can never know its own masked deck contents in advance, so gating here would permanently disable the button even when the server-side deck genuinely has the card', () => {
    const state = readyState(FOLTEST_KING_OF_TEMERIA); // empty deck (baseTestState)
    expect(canActivateLeaderAbility(state, PLAYER_1)).toBe(true);
  });

  it('Emhyr The Relentless is NOT activatable while the opponent\'s discard pile is empty, and becomes activatable once it has a card', () => {
    const state = readyState(EMHYR_THE_RELENTLESS);
    expect(canActivateLeaderAbility(state, PLAYER_1)).toBe(false);

    const withDiscard = updatePlayer(state, PLAYER_2, { discard: [card('d', TIGHT_BOND)] });
    expect(canActivateLeaderAbility(withDiscard, PLAYER_1)).toBe(true);
  });

  it('Eredin Destroyer of Worlds is NOT activatable while the player\'s OWN discard pile is empty, and becomes activatable once it has a card', () => {
    const state = readyState(EREDIN_DESTROYER_OF_WORLDS);
    expect(canActivateLeaderAbility(state, PLAYER_1)).toBe(false);

    const withDiscard = updatePlayer(state, PLAYER_1, { discard: [card('d', TIGHT_BOND)] });
    expect(canActivateLeaderAbility(withDiscard, PLAYER_1)).toBe(true);
  });

  it('Eredin Bringer of Death is NOT activatable with fewer than 2 hand cards or an empty deck, and becomes activatable once both are satisfied', () => {
    const state = readyState(EREDIN_BRINGER_OF_DEATH); // empty hand, empty deck
    expect(canActivateLeaderAbility(state, PLAYER_1)).toBe(false);

    const onlyOneHandCard = updatePlayer(state, PLAYER_1, { hand: [card('h1', TIGHT_BOND)], deck: [card('d1', TIGHT_BOND)] });
    expect(canActivateLeaderAbility(onlyOneHandCard, PLAYER_1)).toBe(false);

    const noDeckCard = updatePlayer(state, PLAYER_1, { hand: [card('h1', TIGHT_BOND), card('h2', TIGHT_BOND)], deck: [] });
    expect(canActivateLeaderAbility(noDeckCard, PLAYER_1)).toBe(false);

    const ready = updatePlayer(state, PLAYER_1, { hand: [card('h1', TIGHT_BOND), card('h2', TIGHT_BOND)], deck: [card('d1', TIGHT_BOND)] });
    expect(canActivateLeaderAbility(ready, PLAYER_1)).toBe(true);
  });

  it('Emhyr The White Flame is itself NEVER activatable — real playtest correction, 2026-08-08: it is passive, not a one-shot ability (see below)', () => {
    const state = readyState(EMHYR_THE_WHITE_FLAME);
    expect(canActivateLeaderAbility(state, PLAYER_1)).toBe(false);
  });

  it('a player\'s own (otherwise perfectly legal) one-shot ability is NOT activatable while the OPPONENT has Emhyr The White Flame', () => {
    const state = readyState(FOLTEST_LORD_COMMANDER_OF_THE_NORTH); // always activatable on its own — see the "SHOULD work" describe block below
    expect(canActivateLeaderAbility(state, PLAYER_1)).toBe(true);

    const canceled = updatePlayer(state, PLAYER_2, { leaderId: EMHYR_THE_WHITE_FLAME });
    expect(canActivateLeaderAbility(canceled, PLAYER_1)).toBe(false);
  });
});

describe('leader abilities that SHOULD work correctly', () => {
  it('Foltest King of Temeria plays an Impenetrable Fog instantly from the deck', () => {
    let state = readyState(FOLTEST_KING_OF_TEMERIA);
    state = updatePlayer(state, PLAYER_1, { deck: [card('fog', 'neutral-impenetrable-fog')] });
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual(['Ranged']);
    expect(getPlayer(next, PLAYER_1).deck).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });

  it('Foltest Lord Commander of the North clears every active weather effect', () => {
    let state = readyState(FOLTEST_LORD_COMMANDER_OF_THE_NORTH);
    state = { ...state, activeWeatherRows: ['Melee', 'Siege'] };
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });

  it('Foltest Son of Medell destroys the opponent\'s Ranged row once it reaches 10', () => {
    let state = readyState(FOLTEST_SON_OF_MEDELL);
    state = updateBoardRow(state, PLAYER_2, 'Ranged', { cards: [card('big', BIG_RANGED)] });
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(next, PLAYER_2).board.Ranged.cards).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });

  it('Foltest The Steel-Forged destroys the opponent\'s Siege row once it reaches 10', () => {
    let state = readyState(FOLTEST_THE_STEEL_FORGED);
    state = updateBoardRow(state, PLAYER_2, 'Siege', { cards: [card('big', BIG_RANGED)] }); // reused fixture, power 10 regardless of its natural row
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(next, PLAYER_2).board.Siege.cards).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });

  it('Emhyr His Imperial Majesty plays a Torrential Rain instantly from the deck', () => {
    let state = readyState(EMHYR_HIS_IMPERIAL_MAJESTY);
    state = updatePlayer(state, PLAYER_1, { deck: [card('rain', 'neutral-torrential-rain')] });
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual(['Siege']);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });

  it('Emhyr Emperor of Nilfgaard reveals exactly 3 of the opponent\'s hand cards when they have 3 or more', () => {
    let state = readyState(EMHYR_EMPEROR_OF_NILFGAARD);
    state = updatePlayer(state, PLAYER_2, {
      hand: [card('a', TIGHT_BOND), card('b', TIGHT_BOND), card('c', TIGHT_BOND), card('d', TIGHT_BOND), card('e', TIGHT_BOND)],
    });
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(next, PLAYER_2).hand).toHaveLength(5); // untouched
    const entry = next.log.find((e) => e.type === 'LEADER_REVEALED_OPPONENT_HAND');
    expect(entry && 'revealedDefIds' in entry ? entry.revealedDefIds : []).toHaveLength(3);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });

  it.each([0, 1, 2])(
    'Emhyr Emperor of Nilfgaard reveals only as many cards as the opponent actually has, when they have fewer than 3 (%i card(s))',
    (handSize) => {
      let state = readyState(EMHYR_EMPEROR_OF_NILFGAARD);
      const hand = Array.from({ length: handSize }, (_, i) => card(`c${i}`, TIGHT_BOND));
      state = updatePlayer(state, PLAYER_2, { hand });
      const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
      const entry = next.log.find((e) => e.type === 'LEADER_REVEALED_OPPONENT_HAND');
      expect(entry && 'revealedDefIds' in entry ? entry.revealedDefIds : []).toHaveLength(handSize);
      // Still a legitimate activation even when there was nothing (or little) to see.
      expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
    },
  );

  it('Emhyr The Relentless draws a chosen card out of the OPPONENT\'s discard pile', () => {
    let state = readyState(EMHYR_THE_RELENTLESS);
    state = updatePlayer(state, PLAYER_2, { discard: [card('target', TIGHT_BOND)] });
    const next = applyLeaderAbility(state, PLAYER_1, 'target', undefined);
    expect(getPlayer(next, PLAYER_1).hand.map((c) => c.instanceId)).toEqual(['target']);
    expect(getPlayer(next, PLAYER_2).discard).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
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
    expect(p1.leaderAbilityUsed).toBe(true);
  });

  it('Eredin Commander of the Red Riders plays any CHOSEN weather card instantly from the deck', () => {
    let state = readyState(EREDIN_COMMANDER_OF_THE_RED_RIDERS);
    state = updatePlayer(state, PLAYER_1, { deck: [card('w', WEATHER_CARD)] });
    const next = applyLeaderAbility(state, PLAYER_1, 'w', undefined);
    expect(next.activeWeatherRows).toEqual(['Melee']);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });

  it('Eredin Destroyer of Worlds restores a chosen card from the player\'s OWN discard pile', () => {
    let state = readyState(EREDIN_DESTROYER_OF_WORLDS);
    state = updatePlayer(state, PLAYER_1, { discard: [card('back', TIGHT_BOND)] });
    const next = applyLeaderAbility(state, PLAYER_1, 'back', undefined);
    expect(getPlayer(next, PLAYER_1).hand.map((c) => c.instanceId)).toEqual(['back']);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });

  it('Francesca Pureblood Elf plays a Biting Frost instantly from the deck', () => {
    let state = readyState(FRANCESCA_PUREBLOOD_ELF);
    state = updatePlayer(state, PLAYER_1, { deck: [card('bf', 'neutral-biting-frost')] });
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual(['Melee']);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });

  it('Francesca Queen of Dol Blathanna destroys the opponent\'s Melee row once it reaches 10', () => {
    let state = readyState(FRANCESCA_QUEEN_OF_DOL_BLATHANNA);
    state = updateBoardRow(state, PLAYER_2, 'Melee', { cards: [card('big', BIG_RANGED)] }); // reused fixture, power 10 regardless of its natural row
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(next, PLAYER_2).board.Melee.cards).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });
});

describe('leader abilities that should NOT fully succeed — board/hand-state thresholds still consume the ability (legitimate, real-game behavior)', () => {
  it('Foltest Son of Medell does nothing below the threshold, but the ability IS still consumed — a deliberate, legal "waste", not a bug', () => {
    let state = readyState(FOLTEST_SON_OF_MEDELL);
    state = updateBoardRow(state, PLAYER_2, 'Ranged', { cards: [card('weak', TIGHT_BOND)] }); // power 3
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(next, PLAYER_2).board.Ranged.cards.map((c) => c.instanceId)).toEqual(['weak']);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });

  it('Foltest Lord Commander of the North "clears weather" even when none is active — still consumed, not a bug', () => {
    const state = readyState(FOLTEST_LORD_COMMANDER_OF_THE_NORTH); // activeWeatherRows already empty
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
  });
});

describe('leader abilities that must NOT work — real playtest bug fixed 2026-08-08: a fizzled activation must not burn the ability', () => {
  it('Foltest King of Temeria does NOT consume the ability when the deck has no Impenetrable Fog', () => {
    const state = readyState(FOLTEST_KING_OF_TEMERIA); // empty deck
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(false);
    expect(next.log.some((e) => e.type === 'LEADER_ABILITY_ACTIVATED')).toBe(false);
  });

  it('Emhyr His Imperial Majesty does NOT consume the ability when the deck has no Torrential Rain', () => {
    const state = readyState(EMHYR_HIS_IMPERIAL_MAJESTY); // empty deck
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(false);
  });

  it('Francesca Pureblood Elf does NOT consume the ability when the deck has no Biting Frost', () => {
    const state = readyState(FRANCESCA_PUREBLOOD_ELF); // empty deck
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(false);
  });

  it('a card of the wrong kind in the deck does not fool the search either — deck contains a Unit, not a Weather card', () => {
    let state = readyState(FOLTEST_KING_OF_TEMERIA);
    state = updatePlayer(state, PLAYER_1, { deck: [card('unit', TIGHT_BOND)] });
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(false);
    expect(getPlayer(next, PLAYER_1).deck).toHaveLength(1); // untouched — nothing was consumed from the deck either
  });

  it('Eredin Commander of the Red Riders does NOT consume the ability when no target is chosen', () => {
    let state = readyState(EREDIN_COMMANDER_OF_THE_RED_RIDERS);
    state = updatePlayer(state, PLAYER_1, { deck: [card('w', WEATHER_CARD)] });
    const next = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(next.activeWeatherRows).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(false);
  });

  it('Eredin Commander of the Red Riders does NOT consume the ability when the chosen target is not a Weather card', () => {
    let state = readyState(EREDIN_COMMANDER_OF_THE_RED_RIDERS);
    state = updatePlayer(state, PLAYER_1, { deck: [card('not-weather', TIGHT_BOND)] });
    const next = applyLeaderAbility(state, PLAYER_1, 'not-weather', undefined);
    expect(next.activeWeatherRows).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(false);
    expect(getPlayer(next, PLAYER_1).deck).toHaveLength(1); // untouched
  });

  it('Emhyr The Relentless does NOT consume the ability when no target is chosen, or the chosen target is not really in the opponent\'s discard', () => {
    const state = readyState(EMHYR_THE_RELENTLESS);
    const noTarget = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(noTarget, PLAYER_1).leaderAbilityUsed).toBe(false);

    const bogusTarget = applyLeaderAbility(state, PLAYER_1, 'does-not-exist', undefined);
    expect(getPlayer(bogusTarget, PLAYER_1).leaderAbilityUsed).toBe(false);
    expect(getPlayer(bogusTarget, PLAYER_1).hand).toEqual([]);
  });

  it('Eredin Destroyer of Worlds does NOT consume the ability when no target is chosen, or the chosen target is not really in the player\'s own discard', () => {
    const state = readyState(EREDIN_DESTROYER_OF_WORLDS);
    const noTarget = applyLeaderAbility(state, PLAYER_1, undefined, undefined);
    expect(getPlayer(noTarget, PLAYER_1).leaderAbilityUsed).toBe(false);

    const bogusTarget = applyLeaderAbility(state, PLAYER_1, 'does-not-exist', undefined);
    expect(getPlayer(bogusTarget, PLAYER_1).leaderAbilityUsed).toBe(false);
  });

  it('Eredin Bringer of Death does NOT consume the ability when fewer than 2 hand cards are chosen to discard', () => {
    let state = readyState(EREDIN_BRINGER_OF_DEATH);
    state = updatePlayer(state, PLAYER_1, { hand: [card('h1', TIGHT_BOND)], deck: [card('d1', TIGHT_BOND)] });
    const next = applyLeaderAbility(state, PLAYER_1, 'd1', ['h1']);
    const p1 = getPlayer(next, PLAYER_1);
    expect(p1.leaderAbilityUsed).toBe(false);
    expect(p1.hand.map((c) => c.instanceId)).toEqual(['h1']); // untouched
    expect(p1.deck.map((c) => c.instanceId)).toEqual(['d1']); // untouched
  });

  it('Eredin Bringer of Death does NOT consume the ability when the chosen draw target is not really in the deck', () => {
    let state = readyState(EREDIN_BRINGER_OF_DEATH);
    state = updatePlayer(state, PLAYER_1, { hand: [card('h1', TIGHT_BOND), card('h2', TIGHT_BOND)], deck: [] });
    const next = applyLeaderAbility(state, PLAYER_1, 'does-not-exist', ['h1', 'h2']);
    const p1 = getPlayer(next, PLAYER_1);
    expect(p1.leaderAbilityUsed).toBe(false);
    expect(p1.hand.map((c) => c.instanceId).sort()).toEqual(['h1', 'h2']); // untouched
  });
});
