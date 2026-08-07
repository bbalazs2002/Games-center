import { describe, expect, it } from 'vitest';
import { chooseGwentAiAction, stateForAiDecision } from './strategy';
import { EMHYR_THE_WHITE_FLAME, FRANCESCA_PUREBLOOD_ELF } from '../engine/leaderConstants';
import { updatePlayer } from '../engine/rules';
import { HIDDEN_CARD_DEF_ID } from '../engine/specialCardIds';
import { baseTestState, card, PLAYER_1, PLAYER_2 } from '../engine/testHelpers';
import type { GwentState } from '../engine/state';

const TIGHT_BOND = 'nilfgaard-impera-brigade-guard'; // power 3
const BIG_RANGED = 'nilfgaard-black-infantry-archer'; // power 10, Ranged, no abilities
const WEAK_VANILLA = 'northern-realms-redanian-foot-soldier'; // power 1, no abilities

function readyState(): GwentState {
  return { ...baseTestState(), phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: 0 };
}

describe('stateForAiDecision', () => {
  it("masks the OPPONENT's hand/deck but leaves the acting player's own hand AND deck real — the fair-play guarantee (docs/gwent-0e-ai-specifikacio.md §4)", () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('own-hand', TIGHT_BOND)], deck: [card('own-deck', TIGHT_BOND)] });
    state = updatePlayer(state, PLAYER_2, { hand: [card('opp-hand', TIGHT_BOND)], deck: [card('opp-deck', TIGHT_BOND)] });

    const masked = stateForAiDecision(state, PLAYER_1);
    const self = masked.players.find((p) => p.id === PLAYER_1)!;
    const opponent = masked.players.find((p) => p.id === PLAYER_2)!;

    expect(self.hand[0].defId).toBe(TIGHT_BOND); // own hand: real
    expect(self.deck[0].defId).toBe(TIGHT_BOND); // own deck: real (needed for correct Spy/Muster/deck-search simulation)
    expect(opponent.hand[0].defId).toBe(HIDDEN_CARD_DEF_ID); // opponent hand: masked
    expect(opponent.deck[0].defId).toBe(HIDDEN_CARD_DEF_ID); // opponent deck: masked
  });
});

describe('chooseGwentAiAction — turn gating', () => {
  it('returns null when it is not this slot\'s turn', () => {
    const state = readyState(); // currentPlayerIndex: 0 -> PLAYER_1's turn
    expect(chooseGwentAiAction(state, PLAYER_2, 'HARD')).toBeNull();
  });

  it('returns null once the round is resolved/finished — leaves CONTINUE_AFTER_ROUND to a human, see strategy.ts doc comment', () => {
    const resolved: GwentState = { ...readyState(), phase: 'ROUND_RESOLVED' };
    expect(chooseGwentAiAction(resolved, PLAYER_1, 'HARD')).toBeNull();
    const finished: GwentState = { ...readyState(), phase: 'FINISHED' };
    expect(chooseGwentAiAction(finished, PLAYER_1, 'HARD')).toBeNull();
  });

  it('never flips the shared, no-single-actor starting coin itself', () => {
    const state: GwentState = { ...readyState(), phase: 'AWAITING_START_CHOICE' };
    // Neither player is Scoia'tael in baseTestState() — nobody has a decisive choice to make.
    expect(chooseGwentAiAction(state, PLAYER_1, 'HARD')).toBeNull();
    expect(chooseGwentAiAction(state, PLAYER_2, 'HARD')).toBeNull();
  });
});

describe('chooseGwentAiAction — mulligan', () => {
  it('swaps a hand card clearly below the hand average, then eventually confirms', () => {
    let state = baseTestState(); // MULLIGAN phase
    state = updatePlayer(state, PLAYER_1, {
      hand: [card('weak', WEAK_VANILLA), card('strong', BIG_RANGED)],
      deck: [card('d1', TIGHT_BOND)],
    });
    const action = chooseGwentAiAction(state, PLAYER_1, 'HARD');
    expect(action).toEqual({ type: 'MULLIGAN_SWAP', playerId: PLAYER_1, instanceId: 'weak' });
  });

  it('confirms once nothing is worth swapping (or the allowance is spent)', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', BIG_RANGED), card('b', BIG_RANGED)], mulligansLeft: 0 });
    const action = chooseGwentAiAction(state, PLAYER_1, 'HARD');
    expect(action).toEqual({ type: 'CONFIRM_MULLIGAN', playerId: PLAYER_1 });
  });
});

describe('chooseGwentAiAction — starting choice', () => {
  it('always picks itself when it holds the decisive Scoia\'tael choice', () => {
    let state: GwentState = { ...baseTestState(), phase: 'AWAITING_START_CHOICE', round: 1 };
    state = updatePlayer(state, PLAYER_1, { faction: 'Scoiatael' });
    const action = chooseGwentAiAction(state, PLAYER_1, 'HARD');
    expect(action).toEqual({ type: 'CHOOSE_STARTING_PLAYER', playerId: PLAYER_1, chosenPlayerId: PLAYER_1 });
  });
});

describe('chooseGwentAiAction — in-round decisions', () => {
  it('HARD picks the single clearly-best legal action (plays the big card, not PASS)', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('big', BIG_RANGED)] });
    const action = chooseGwentAiAction(state, PLAYER_1, 'HARD');
    expect(action).toEqual({ type: 'PLAY_CARD', playerId: PLAYER_1, instanceId: 'big' });
  });

  it('passes when there is nothing left to play', () => {
    const state = readyState(); // empty hand
    const action = chooseGwentAiAction(state, PLAYER_1, 'HARD');
    expect(action).toEqual({ type: 'PASS', playerId: PLAYER_1 });
  });

  it("never gets to see the opponent's real hand while deciding — canActivateLeaderAbility/leader-ability targeting never touches it either", () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { leaderId: FRANCESCA_PUREBLOOD_ELF, hand: [card('a', TIGHT_BOND)] });
    state = updatePlayer(state, PLAYER_2, { hand: [card('secret', BIG_RANGED)] });
    // Just confirming this doesn't throw/misbehave when the opponent holds real cards —
    // the actual masking guarantee is asserted directly in the stateForAiDecision suite above.
    expect(() => chooseGwentAiAction(state, PLAYER_1, 'HARD')).not.toThrow();
  });

  it("respects Emhyr The White Flame — an opponent's cancellation still applies to the AI's own leader ability", () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { leaderId: FRANCESCA_PUREBLOOD_ELF, hand: [], leaderAbilityUsed: false });
    state = updatePlayer(state, PLAYER_2, { leaderId: EMHYR_THE_WHITE_FLAME });
    // No hand, ability canceled by the opponent's White Flame — nothing legal but PASS.
    const action = chooseGwentAiAction(state, PLAYER_1, 'HARD');
    expect(action).toEqual({ type: 'PASS', playerId: PLAYER_1 });
  });
});
