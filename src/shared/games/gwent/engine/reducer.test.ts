import { describe, expect, it, vi } from 'vitest';
import { reducer } from './reducer';
import { getPlayer, updateBoardRow, updatePlayer } from './rules';
import { baseTestState, card, PLAYER_1, PLAYER_2 } from './testHelpers';
import { BOVINE_DEFENSE_FORCE_CARD_ID, COW_CARD_ID, DANDELION_CARD_ID, DECOY_CARD_ID, HORN_CARD_ID, SCORCH_CARD_ID } from './specialCardIds';
import { EMHYR_INVADER_OF_THE_NORTH, FOLTEST_LORD_COMMANDER_OF_THE_NORTH, FRANCESCA_HOPE_OF_THE_AEN_SEIDHE } from './leaderConstants';
import type { GwentState } from './state';

const TIGHT_BOND = 'nilfgaard-impera-brigade-guard'; // power 3, Melee
const MUSTER = 'monsters-arachas'; // power 4, Melee, Muster, copies 3
const SPY = 'nilfgaard-shilard-fitz-oesterlen'; // power 7, Melee, Spy
const MEDIC = 'nilfgaard-etolian-auxiliary-archers'; // power 1, Ranged, Medic
const AGILE = 'monsters-celaeno-harpy'; // power 2, Agile
const HERO = 'monsters-draug'; // power 10, Melee, Hero
const TOAD = 'monsters-toad'; // power 7, Ranged, rowScorch { Ranged, threshold 10 }
const BIG_RANGED = 'nilfgaard-black-infantry-archer'; // power 10, Ranged, no abilities

function readyState(): GwentState {
  return { ...baseTestState(), phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: 0 };
}

describe('reducer — mulligan', () => {
  it('a swapped-out card is held aside, never immediately redrawable within the same mulligan', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', MEDIC)], deck: [card('d1', TIGHT_BOND), card('d2', AGILE)] });

    let next = reducer(state, { type: 'MULLIGAN_SWAP', playerId: PLAYER_1, instanceId: 'a' });
    next = reducer(next, { type: 'MULLIGAN_SWAP', playerId: PLAYER_1, instanceId: 'd1' });

    const p1 = getPlayer(next, PLAYER_1);
    expect(p1.hand.map((c) => c.instanceId)).toEqual(['d2']);
    expect(p1.mulliganSetAside.map((c) => c.instanceId).sort()).toEqual(['a', 'd1']);
    expect(p1.deck).toEqual([]);
  });

  it('CONFIRM_MULLIGAN shuffles the set-aside cards back into the deck; phase advances once BOTH players confirm', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', MEDIC)], deck: [card('d1', TIGHT_BOND)] });
    let next = reducer(state, { type: 'MULLIGAN_SWAP', playerId: PLAYER_1, instanceId: 'a' });
    next = reducer(next, { type: 'CONFIRM_MULLIGAN', playerId: PLAYER_1 });

    const p1 = getPlayer(next, PLAYER_1);
    expect(p1.mulliganConfirmed).toBe(true);
    expect(p1.mulliganSetAside).toEqual([]);
    expect(p1.deck.map((c) => c.instanceId)).toEqual(['a']);
    expect(next.phase).toBe('MULLIGAN'); // player 2 hasn't confirmed yet

    next = reducer(next, { type: 'CONFIRM_MULLIGAN', playerId: PLAYER_2 });
    expect(next.phase).toBe('AWAITING_START_CHOICE');
  });
});

describe('reducer — starting player', () => {
  it('a coin flip decides who starts when neither player is Scoia\'tael', () => {
    const state: GwentState = { ...baseTestState(), phase: 'AWAITING_START_CHOICE' };
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.9); // >= 0.5 -> torch -> player-2
    const next = reducer(state, { type: 'FLIP_STARTING_COIN' });
    spy.mockRestore();
    expect(next.phase).toBe('ROUND_IN_PROGRESS');
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.log.some((e) => e.type === 'STARTING_COIN_FLIP')).toBe(true);
  });

  it('CHOOSE_STARTING_PLAYER is only legal for the decisive Scoia\'tael player, and a coin flip is rejected outright', () => {
    let state: GwentState = { ...baseTestState(), phase: 'AWAITING_START_CHOICE' };
    state = updatePlayer(state, PLAYER_2, { faction: 'Scoiatael' });

    expect(reducer(state, { type: 'FLIP_STARTING_COIN' })).toBe(state);
    expect(reducer(state, { type: 'CHOOSE_STARTING_PLAYER', playerId: PLAYER_1, chosenPlayerId: PLAYER_1 })).toBe(state);

    const next = reducer(state, { type: 'CHOOSE_STARTING_PLAYER', playerId: PLAYER_2, chosenPlayerId: PLAYER_1 });
    expect(next.phase).toBe('ROUND_IN_PROGRESS');
    expect(next.currentPlayerIndex).toBe(0);
  });
});

describe('reducer — PLAY_CARD', () => {
  it('places a fixed-row unit on the board, removes it from hand, and advances the turn', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', TIGHT_BOND)] });
    const next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'a' });
    expect(getPlayer(next, PLAYER_1).hand).toEqual([]);
    expect(getPlayer(next, PLAYER_1).board.Melee.cards.map((c) => c.instanceId)).toEqual(['a']);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('a Spy card is placed on the OPPONENT board and draws the playing player 2 cards', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('spy', SPY)], deck: [card('d1', TIGHT_BOND), card('d2', AGILE)] });
    const next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'spy' });
    expect(getPlayer(next, PLAYER_2).board.Melee.cards.map((c) => c.instanceId)).toEqual(['spy']);
    expect(getPlayer(next, PLAYER_1).hand.map((c) => c.instanceId).sort()).toEqual(['d1', 'd2']);
  });

  it('Muster auto-plays every same-defId partner from hand AND deck in one go', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('m1', MUSTER), card('m2', MUSTER)], deck: [card('m3', MUSTER)] });
    const next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'm1' });
    expect(getPlayer(next, PLAYER_1).board.Melee.cards.map((c) => c.instanceId).sort()).toEqual(['m1', 'm2', 'm3']);
    expect(getPlayer(next, PLAYER_1).hand).toEqual([]);
    expect(getPlayer(next, PLAYER_1).deck).toEqual([]);
  });

  it('Medic can revive a chosen discard unit, or decline (Hero units never eligible)', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('medic', MEDIC)], discard: [card('dead', TIGHT_BOND), card('hero', HERO)] });

    const declined = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'medic' });
    expect(getPlayer(declined, PLAYER_1).discard.map((c) => c.instanceId).sort()).toEqual(['dead', 'hero']);

    const revived = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'medic', medicReviveInstanceId: 'dead' });
    expect(getPlayer(revived, PLAYER_1).board.Melee.cards.map((c) => c.instanceId)).toEqual(['dead']);
    expect(getPlayer(revived, PLAYER_1).discard.map((c) => c.instanceId)).toEqual(['hero']);
  });

  it('Emhyr Invader of the North forces a random Medic target regardless of any request, for EITHER player', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_2, { leaderId: EMHYR_INVADER_OF_THE_NORTH });
    state = updatePlayer(state, PLAYER_1, { hand: [card('medic', MEDIC)], discard: [card('only', TIGHT_BOND)] });
    const next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'medic' });
    expect(getPlayer(next, PLAYER_1).board.Melee.cards.map((c) => c.instanceId)).toEqual(['only']);
  });

  it('Decoy swaps a board card back to hand WITHOUT triggering the Cow replacement (approved exception)', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('decoy', DECOY_CARD_ID)] });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('cow', COW_CARD_ID)] });
    const next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'decoy', decoyTargetInstanceId: 'cow' });
    expect(getPlayer(next, PLAYER_1).hand.map((c) => c.instanceId)).toEqual(['cow']);
    expect(getPlayer(next, PLAYER_1).board.Melee.cards).toEqual([]);
    expect(getPlayer(next, PLAYER_1).discard.map((c) => c.instanceId)).toEqual(['decoy']);
  });

  it('a Horn card sets the chosen row\'s flag and discards itself', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('horn', HORN_CARD_ID)] });
    const next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'horn', chosenRow: 'Siege' });
    expect(getPlayer(next, PLAYER_1).board.Siege.hornActive).toBe(true);
    expect(getPlayer(next, PLAYER_1).discard.map((c) => c.instanceId)).toEqual(['horn']);
  });

  it('Scorch destroys the strongest unit(s) across the WHOLE board, both sides, sparing weaker cards', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('scorch', SCORCH_CARD_ID)] });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('strong', TOAD)] }); // 7
    state = updateBoardRow(state, PLAYER_2, 'Ranged', { cards: [card('weak', MEDIC)] }); // 1
    const next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'scorch' });
    expect(getPlayer(next, PLAYER_1).board.Melee.cards).toEqual([]);
    expect(getPlayer(next, PLAYER_2).board.Ranged.cards.map((c) => c.instanceId)).toEqual(['weak']);
  });

  it('destroying a Cow via Scorch conjures a Bovine Defense Force in the same row', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('scorch', SCORCH_CARD_ID)] });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('cow', COW_CARD_ID)] }); // sole, strongest-by-default card on the board
    const next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'scorch' });
    const boardIds = getPlayer(next, PLAYER_1).board.Melee.cards.map((c) => c.defId);
    expect(boardIds).toEqual([BOVINE_DEFENSE_FORCE_CARD_ID]);
  });

  it('a Weather card marks its row; Clear Weather resets all of them', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('bf', 'neutral-biting-frost')] });
    let next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'bf' });
    expect(next.activeWeatherRows).toEqual(['Melee']);

    next = updatePlayer(next, PLAYER_2, { hand: [card('cw', 'neutral-clear-weather')] });
    next = { ...next, currentPlayerIndex: 1 };
    next = reducer(next, { type: 'PLAY_CARD', playerId: PLAYER_2, instanceId: 'cw' });
    expect(next.activeWeatherRows).toEqual([]);
  });

  it('a rowScorch card (Toad) destroys the opponent\'s targeted row once its total reaches the threshold', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('toad', TOAD)] });
    state = updateBoardRow(state, PLAYER_2, 'Ranged', { cards: [card('big', BIG_RANGED)] }); // exactly 10
    const next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'toad' });
    expect(getPlayer(next, PLAYER_2).board.Ranged.cards).toEqual([]);
    expect(next.log.some((e) => e.type === 'ROW_SCORCH_RESOLVED')).toBe(true);
  });

  it('Dandelion persistently doubles its row, and the flag clears once it leaves via Decoy', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('dandelion', DANDELION_CARD_ID)] });
    let next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'dandelion' });
    expect(getPlayer(next, PLAYER_1).board.Melee.dandelionActive).toBe(true);

    next = updatePlayer(next, PLAYER_1, { hand: [card('decoy', DECOY_CARD_ID)] });
    next = { ...next, currentPlayerIndex: 0 };
    next = reducer(next, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'decoy', decoyTargetInstanceId: 'dandelion' });
    expect(getPlayer(next, PLAYER_1).board.Melee.dandelionActive).toBe(false);
  });

  it('Francesca Hope of the Aen Seidhe auto-places an Agile unit in whichever row maximizes its power, ignoring the requested chosenRow', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { leaderId: FRANCESCA_HOPE_OF_THE_AEN_SEIDHE, hand: [card('a', AGILE)] });
    state = { ...state, activeWeatherRows: ['Melee'] }; // Melee power drops to 1, Ranged stays at 2 — Ranged should win
    const next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'a', chosenRow: 'Melee' });
    expect(getPlayer(next, PLAYER_1).board.Ranged.cards.map((c) => c.instanceId)).toEqual(['a']);
    expect(getPlayer(next, PLAYER_1).board.Melee.cards).toEqual([]);
  });

  it('once the opponent has passed, the acting player keeps taking turns alone', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_2, { passed: true });
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', TIGHT_BOND)] });
    const next = reducer(state, { type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'a' });
    expect(next.currentPlayerIndex).toBe(0);
  });
});

describe('reducer — PASS / round resolution', () => {
  it('resolves the round once both players pass, awarding lives/roundsWon and the Northern Realms bonus draw', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { faction: 'NorthernRealms', deck: [card('bonus', TIGHT_BOND)] });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', TOAD)] }); // 7 vs 0

    let next = reducer(state, { type: 'PASS', playerId: PLAYER_1 });
    expect(next.currentPlayerIndex).toBe(1);
    next = reducer(next, { type: 'PASS', playerId: PLAYER_2 });

    expect(next.phase).toBe('ROUND_RESOLVED');
    const p1 = getPlayer(next, PLAYER_1);
    expect(p1.roundsWon).toBe(1);
    expect(getPlayer(next, PLAYER_2).lives).toBe(1);
    expect(p1.hand.map((c) => c.instanceId)).toEqual(['bonus']);
    expect(p1.board.Melee.cards).toEqual([]);
  });

  it('the Monsters bonus keeps exactly 1 random surviving unit on the board, the rest goes to discard', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { faction: 'Monsters' });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', TIGHT_BOND), card('b', TIGHT_BOND)] });
    let next = reducer(state, { type: 'PASS', playerId: PLAYER_1 });
    next = reducer(next, { type: 'PASS', playerId: PLAYER_2 });
    const p1 = getPlayer(next, PLAYER_1);
    const remaining = [...p1.board.Melee.cards, ...p1.board.Ranged.cards, ...p1.board.Siege.cards];
    expect(remaining).toHaveLength(1);
    expect(p1.discard).toHaveLength(1);
  });

  it('a real tie (neither side Nilfgaard) costs BOTH players a life', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { faction: 'Monsters' });
    state = updatePlayer(state, PLAYER_2, { faction: 'Scoiatael' });
    let next = reducer(state, { type: 'PASS', playerId: PLAYER_1 });
    next = reducer(next, { type: 'PASS', playerId: PLAYER_2 });
    expect(getPlayer(next, PLAYER_1).lives).toBe(1);
    expect(getPlayer(next, PLAYER_2).lives).toBe(1);
  });
});

describe('reducer — CONTINUE_AFTER_ROUND', () => {
  function resolvedRoundState(): GwentState {
    let state = readyState();
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', TOAD)] }); // player 1 wins
    let next = reducer(state, { type: 'PASS', playerId: PLAYER_1 });
    next = reducer(next, { type: 'PASS', playerId: PLAYER_2 });
    return next;
  }

  it('advances to the next round with the round\'s LOSER starting, when no Scoia\'tael is decisive', () => {
    const next = reducer(resolvedRoundState(), { type: 'CONTINUE_AFTER_ROUND' });
    expect(next.phase).toBe('ROUND_IN_PROGRESS');
    expect(next.round).toBe(2);
    expect(next.currentPlayerIndex).toBe(1); // player 2 lost round 1
    expect(next.players.every((p) => !p.passed)).toBe(true);
  });

  it('Scoia\'tael\'s "choose who starts" only applies to round 1 — round 2+ still uses the loser-starts default', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_2, { faction: 'Scoiatael' });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', TOAD)] });
    let next = reducer(state, { type: 'PASS', playerId: PLAYER_1 });
    next = reducer(next, { type: 'PASS', playerId: PLAYER_2 });
    next = reducer(next, { type: 'CONTINUE_AFTER_ROUND' });
    expect(next.phase).toBe('ROUND_IN_PROGRESS');
    expect(next.round).toBe(2);
    expect(next.currentPlayerIndex).toBe(1); // player 2 lost round 1, starts round 2 regardless of their Scoia'tael faction
  });

  it('ends the game once a player reaches 0 lives', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_2, { lives: 1 });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', TOAD)] });
    let next = reducer(state, { type: 'PASS', playerId: PLAYER_1 });
    next = reducer(next, { type: 'PASS', playerId: PLAYER_2 });
    next = reducer(next, { type: 'CONTINUE_AFTER_ROUND' });
    expect(next.phase).toBe('FINISHED');
    expect(next.winnerIds).toEqual([PLAYER_1]);
  });

  it('ends the game once a player reaches 2 rounds won, even with lives remaining', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { roundsWon: 1 });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', TOAD)] });
    let next = reducer(state, { type: 'PASS', playerId: PLAYER_1 });
    next = reducer(next, { type: 'PASS', playerId: PLAYER_2 });
    next = reducer(next, { type: 'CONTINUE_AFTER_ROUND' });
    expect(next.phase).toBe('FINISHED');
    expect(next.winnerIds).toEqual([PLAYER_1]);
  });
});

describe('reducer — ACTIVATE_LEADER_ABILITY', () => {
  it('consumes the turn exactly like PLAY_CARD/PASS, and can only be used once', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { leaderId: FOLTEST_LORD_COMMANDER_OF_THE_NORTH });
    state = { ...state, activeWeatherRows: ['Melee'] };

    const next = reducer(state, { type: 'ACTIVATE_LEADER_ABILITY', playerId: PLAYER_1 });
    expect(next.activeWeatherRows).toEqual([]);
    expect(getPlayer(next, PLAYER_1).leaderAbilityUsed).toBe(true);
    expect(next.currentPlayerIndex).toBe(1);

    const alreadyUsedState = { ...next, currentPlayerIndex: 0 };
    const rejected = reducer(alreadyUsedState, { type: 'ACTIVATE_LEADER_ABILITY', playerId: PLAYER_1 });
    expect(rejected).toBe(alreadyUsedState); // already used — no-op
  });
});
