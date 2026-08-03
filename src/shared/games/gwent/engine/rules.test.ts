import { describe, expect, it } from 'vitest';
import type { GwentState } from './state';
import {
  canConfirmMulligan,
  canMulliganSwap,
  canPass,
  canPlayCard,
  computeCardPower,
  computeRowTotal,
  destroyStrongestAcross,
  eligibleMedicTargets,
  expectedViewerId,
  findMusterPartnerDefIds,
  getPlayer,
  pickMedicTarget,
  resolveRoundOutcome,
  toPublicGwentState,
  updateBoardRow,
  updatePlayer,
} from './rules';
import { baseTestState, card, PLAYER_1, PLAYER_2 } from './testHelpers';
import { BOVINE_DEFENSE_FORCE_CARD_ID, COW_CARD_ID, DANDELION_CARD_ID, HIDDEN_CARD_DEF_ID, HORN_CARD_ID } from './specialCardIds';
import {
  EREDIN_BREACC_GLAS_THE_TREACHEROUS,
  EREDIN_KING_OF_THE_WILD_HUNT,
  FOLTEST_THE_SIEGEMASTER,
  FRANCESCA_THE_BEAUTIFUL,
} from './leaderConstants';

const HERO = 'monsters-draug'; // power 10, Melee, Hero
const SPY = 'nilfgaard-shilard-fitz-oesterlen'; // power 7, Melee, Spy
const TIGHT_BOND = 'nilfgaard-impera-brigade-guard'; // power 3, Melee, TightBond, copies 4
const MUSTER = 'monsters-arachas'; // power 4, Melee, Muster, copies 3
const MORALE_BOOST = 'northern-realms-kaedweni-siege-expert'; // power 1, Siege, MoraleBoost
const MEDIC = 'nilfgaard-etolian-auxiliary-archers'; // power 1, Ranged, Medic
const AGILE = 'monsters-celaeno-harpy'; // power 2, Agile
const TOAD = 'monsters-toad'; // power 7, Ranged, rowScorch { Ranged, 10 }
const CRONE_A = 'monsters-crone-brewess';
const CRONE_B = 'monsters-crone-weavess';
const CRONE_C = 'monsters-crone-whispess';

describe('computeCardPower', () => {
  it('a Hero card ignores every modifier (weather, Horn, Tight Bond)', () => {
    let state = baseTestState();
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', HERO)], hornActive: true });
    state = { ...state, activeWeatherRows: ['Melee'] };
    expect(computeCardPower(state, PLAYER_1, 'Melee', card('a', HERO))).toBe(10);
  });

  it('weather sets base power to 1 before any other modifier applies', () => {
    let state = baseTestState();
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', SPY)] });
    state = { ...state, activeWeatherRows: ['Melee'] };
    expect(computeCardPower(state, PLAYER_1, 'Melee', card('a', SPY))).toBe(1);
  });

  it('Tight Bond doubles per same-defId sibling in the row (2 copies -> x2, 3 copies -> x4)', () => {
    let state = baseTestState();
    state = updateBoardRow(state, PLAYER_1, 'Melee', {
      cards: [card('a', TIGHT_BOND), card('b', TIGHT_BOND)],
    });
    expect(computeCardPower(state, PLAYER_1, 'Melee', card('a', TIGHT_BOND))).toBe(6);

    state = updateBoardRow(state, PLAYER_1, 'Melee', {
      cards: [card('a', TIGHT_BOND), card('b', TIGHT_BOND), card('c', TIGHT_BOND)],
    });
    expect(computeCardPower(state, PLAYER_1, 'Melee', card('a', TIGHT_BOND))).toBe(12);
  });

  it('Morale Boost adds +1 per source to every OTHER card in the row, never to itself', () => {
    let state = baseTestState();
    state = updateBoardRow(state, PLAYER_1, 'Siege', { cards: [card('a', MORALE_BOOST), card('b', MORALE_BOOST)] });
    // Each card gets +1 from the OTHER Morale Boost source only.
    expect(computeCardPower(state, PLAYER_1, 'Siege', card('a', MORALE_BOOST))).toBe(2);
  });

  it('Horn doubles the row (after Morale Boost has already been added)', () => {
    let state = baseTestState();
    state = updateBoardRow(state, PLAYER_1, 'Siege', { cards: [card('a', MORALE_BOOST)], hornActive: true });
    expect(computeCardPower(state, PLAYER_1, 'Siege', card('a', MORALE_BOOST))).toBe(2); // 1 base, no other MoraleBoost source, x2 Horn
  });

  it('Dandelion doubles every OTHER card in its row but never itself', () => {
    let state = baseTestState();
    state = updateBoardRow(state, PLAYER_1, 'Melee', {
      cards: [card('d', DANDELION_CARD_ID), card('a', TIGHT_BOND)],
      dandelionActive: true,
    });
    expect(computeCardPower(state, PLAYER_1, 'Melee', card('a', TIGHT_BOND))).toBe(6); // 3 base x2 Dandelion
    expect(computeCardPower(state, PLAYER_1, 'Melee', card('d', DANDELION_CARD_ID))).toBe(2); // Dandelion's own base power, undoubled
  });

  it('a Spy card sits in the OPPONENT board row and counts toward the opponent total', () => {
    let state = baseTestState();
    state = updateBoardRow(state, PLAYER_2, 'Melee', { cards: [card('a', SPY)] });
    expect(computeRowTotal(state, PLAYER_2, 'Melee')).toBe(7);
    expect(computeRowTotal(state, PLAYER_1, 'Melee')).toBe(0);
  });
});

describe('resolveRoundOutcome', () => {
  it('the higher side total wins, no tie handling involved', () => {
    let state = baseTestState();
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', TOAD)] }); // 7
    state = updateBoardRow(state, PLAYER_2, 'Melee', { cards: [card('b', MEDIC)] }); // 1
    const outcome = resolveRoundOutcome(state);
    expect(outcome.winnerId).toBe(PLAYER_1);
    expect(outcome.tie).toBe(false);
  });

  it('a real tie (neither side Nilfgaard) has no winner', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { faction: 'Monsters' });
    state = updatePlayer(state, PLAYER_2, { faction: 'Scoiatael' });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', TOAD)] });
    state = updateBoardRow(state, PLAYER_2, 'Melee', { cards: [card('b', TOAD)] });
    const outcome = resolveRoundOutcome(state);
    expect(outcome.tie).toBe(true);
    expect(outcome.winnerId).toBeNull();
  });

  it('Nilfgaard automatically wins a tie', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_2, { faction: 'Nilfgaard' });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', TOAD)] });
    state = updateBoardRow(state, PLAYER_2, 'Melee', { cards: [card('b', TOAD)] });
    const outcome = resolveRoundOutcome(state);
    expect(outcome.tie).toBe(false);
    expect(outcome.winnerId).toBe(PLAYER_2);
  });
});

describe('canPlayCard', () => {
  it('rejects a fixed-row unit that supplies a chosenRow', () => {
    let state = baseTestState();
    state = { ...state, phase: 'ROUND_IN_PROGRESS' };
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', TIGHT_BOND)] });
    expect(canPlayCard(state, PLAYER_1, 'a', 'Melee')).toBe(false);
    expect(canPlayCard(state, PLAYER_1, 'a')).toBe(true);
  });

  it('requires a valid row choice for an Agile unit', () => {
    let state = baseTestState();
    state = { ...state, phase: 'ROUND_IN_PROGRESS' };
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', AGILE)] });
    expect(canPlayCard(state, PLAYER_1, 'a')).toBe(false);
    expect(canPlayCard(state, PLAYER_1, 'a', 'Siege')).toBe(false);
    expect(canPlayCard(state, PLAYER_1, 'a', 'Ranged')).toBe(true);
  });

  it('requires a row choice for a Horn card', () => {
    let state = baseTestState();
    state = { ...state, phase: 'ROUND_IN_PROGRESS' };
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', HORN_CARD_ID)] });
    expect(canPlayCard(state, PLAYER_1, 'a')).toBe(false);
    expect(canPlayCard(state, PLAYER_1, 'a', 'Melee')).toBe(true);
  });

  it('requires a valid own-board target for a Decoy card', () => {
    let state = baseTestState();
    state = { ...state, phase: 'ROUND_IN_PROGRESS' };
    state = updatePlayer(state, PLAYER_1, { hand: [card('decoy', 'neutral-decoy')] });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', TIGHT_BOND)] });
    expect(canPlayCard(state, PLAYER_1, 'decoy')).toBe(false);
    expect(canPlayCard(state, PLAYER_1, 'decoy', undefined, 'nonexistent')).toBe(false);
    expect(canPlayCard(state, PLAYER_1, 'decoy', undefined, 'a')).toBe(true);
  });

  it('rejects it outside the acting player\'s turn or after they passed', () => {
    let state = baseTestState();
    state = { ...state, phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: 0 };
    state = updatePlayer(state, PLAYER_2, { hand: [card('a', TIGHT_BOND)] });
    expect(canPlayCard(state, PLAYER_2, 'a')).toBe(false);

    state = { ...state, currentPlayerIndex: 1 };
    state = updatePlayer(state, PLAYER_2, { passed: true });
    expect(canPlayCard(state, PLAYER_2, 'a')).toBe(false);
  });
});

describe('canMulliganSwap / canConfirmMulligan / canPass', () => {
  it('only allows swapping a card actually in hand, before mulligansLeft reaches 0 or confirmation', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', TIGHT_BOND)] });
    expect(canMulliganSwap(state, PLAYER_1, 'a')).toBe(true);
    expect(canMulliganSwap(state, PLAYER_1, 'nonexistent')).toBe(false);

    state = updatePlayer(state, PLAYER_1, { mulligansLeft: 0 });
    expect(canMulliganSwap(state, PLAYER_1, 'a')).toBe(false);

    state = updatePlayer(state, PLAYER_1, { mulligansLeft: 2, mulliganConfirmed: true });
    expect(canMulliganSwap(state, PLAYER_1, 'a')).toBe(false);
    expect(canConfirmMulligan(state, PLAYER_1)).toBe(false);
  });

  it('canPass requires ROUND_IN_PROGRESS, the acting player\'s turn, and not already passed', () => {
    let state = baseTestState();
    expect(canPass(state, PLAYER_1)).toBe(false); // still MULLIGAN
    state = { ...state, phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: 0 };
    expect(canPass(state, PLAYER_1)).toBe(true);
    expect(canPass(state, PLAYER_2)).toBe(false);
  });
});

describe('findMusterPartnerDefIds', () => {
  it('includes the same defId plus the additive mustersWithIds group (Crones, not by name)', () => {
    expect(findMusterPartnerDefIds(CRONE_A).sort()).toEqual([CRONE_A, CRONE_B, CRONE_C].sort());
  });

  it('a card with no group only musters same-defId copies', () => {
    expect(findMusterPartnerDefIds(MUSTER)).toEqual([MUSTER]);
  });
});

describe('eligibleMedicTargets / pickMedicTarget', () => {
  it('excludes Hero units and non-unit special cards from the discard pile', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { discard: [card('h', HERO), card('m', MEDIC), card('s', 'neutral-scorch')] });
    const eligible = eligibleMedicTargets(getPlayer(state, PLAYER_1));
    expect(eligible.map((c) => c.instanceId)).toEqual(['m']);
    expect(pickMedicTarget(state, PLAYER_1, 'm')?.instanceId).toBe('m');
    expect(pickMedicTarget(state, PLAYER_1, undefined)).toBeNull(); // declined
    expect(pickMedicTarget(state, PLAYER_1, 'h')).toBeNull(); // Hero not selectable even if explicitly requested
  });
});

describe('destroyStrongestAcross', () => {
  it('destroys only the strongest card(s), spares weaker ones and Hero units', () => {
    let state = baseTestState();
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('weak', MEDIC), card('hero', HERO)] }); // 1, 10 (Hero immune)
    state = updateBoardRow(state, PLAYER_1, 'Ranged', { cards: [card('strong', TOAD)] }); // 7
    const result = destroyStrongestAcross(state, [
      { playerId: PLAYER_1, row: 'Melee' },
      { playerId: PLAYER_1, row: 'Ranged' },
    ]);
    expect(result.destroyedInstanceIds).toEqual(['strong']);
  });

  it('a tie destroys all tied-for-strongest cards', () => {
    let state = baseTestState();
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', TOAD)] });
    state = updateBoardRow(state, PLAYER_2, 'Melee', { cards: [card('b', TOAD)] });
    const result = destroyStrongestAcross(state, [
      { playerId: PLAYER_1, row: 'Melee' },
      { playerId: PLAYER_2, row: 'Melee' },
    ]);
    expect(result.destroyedInstanceIds.sort()).toEqual(['a', 'b']);
  });

  it('destroying a Cow conjures a Bovine Defense Force in the same row (2026-08-04 approved exception: only outside Decoy)', () => {
    let state = baseTestState();
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('cow', COW_CARD_ID), card('strong', TOAD)] });
    const result = destroyStrongestAcross(state, [{ playerId: PLAYER_1, row: 'Melee' }]);
    // Toad (7) is strictly stronger than Cow (0) so only Toad dies here — use a same-power setup instead.
    expect(result.destroyedInstanceIds).toEqual(['strong']);

    state = updateBoardRow(baseTestState(), PLAYER_1, 'Melee', { cards: [card('cow', COW_CARD_ID)] });
    const cowOnly = destroyStrongestAcross(state, [{ playerId: PLAYER_1, row: 'Melee' }]);
    expect(cowOnly.destroyedInstanceIds).toEqual(['cow']);
    expect(cowOnly.cowReplacements).toHaveLength(1);
    expect(cowOnly.cowReplacements[0].playerId).toBe(PLAYER_1);
    const bovine = getPlayer(cowOnly.state, PLAYER_1).board.Melee.cards.find((c) => c.defId === BOVINE_DEFENSE_FORCE_CARD_ID);
    expect(bovine).toBeDefined();
  });
});

describe('leader passives (category B) via computeCardPower', () => {
  it('Foltest The Siegemaster/Eredin King of the Wild Hunt/Francesca The Beautiful each auto-double their own Siege/Melee/Ranged row, never stacking with a real Horn', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { leaderId: FOLTEST_THE_SIEGEMASTER });
    state = updateBoardRow(state, PLAYER_1, 'Siege', { cards: [card('a', TIGHT_BOND)] });
    expect(computeCardPower(state, PLAYER_1, 'Siege', card('a', TIGHT_BOND))).toBe(6); // 3 x2 auto-Horn
    expect(computeCardPower(state, PLAYER_1, 'Melee', card('a', TIGHT_BOND))).toBe(3); // wrong row — no bonus

    state = updatePlayer(baseTestState(), PLAYER_1, { leaderId: EREDIN_KING_OF_THE_WILD_HUNT });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', TIGHT_BOND)], hornActive: true });
    expect(computeCardPower(state, PLAYER_1, 'Melee', card('a', TIGHT_BOND))).toBe(6); // real Horn + auto-Horn does NOT stack to x4

    state = updatePlayer(baseTestState(), PLAYER_1, { leaderId: FRANCESCA_THE_BEAUTIFUL });
    state = updateBoardRow(state, PLAYER_1, 'Ranged', { cards: [card('a', TIGHT_BOND)] });
    expect(computeCardPower(state, PLAYER_1, 'Ranged', card('a', TIGHT_BOND))).toBe(6);
  });

  it('Eredin Breacc Glas The Treacherous doubles every Spy card\'s power on BOTH sides', () => {
    const SPY = 'nilfgaard-shilard-fitz-oesterlen'; // power 7
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_2, { leaderId: EREDIN_BREACC_GLAS_THE_TREACHEROUS });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('a', SPY)] }); // player 1's own Spy card, leader belongs to player 2
    expect(computeCardPower(state, PLAYER_1, 'Melee', card('a', SPY))).toBe(14);
  });
});

describe('toPublicGwentState', () => {
  function stateWithSecrets(): GwentState {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, {
      hand: [card('p1-hand-a', HERO)],
      deck: [card('p1-deck-a', HERO), card('p1-deck-b', HERO)],
      mulliganSetAside: [card('p1-aside-a', HERO)],
    });
    state = updatePlayer(state, PLAYER_2, {
      hand: [card('p2-hand-a', HERO), card('p2-hand-b', HERO)],
      deck: [card('p2-deck-a', HERO)],
      mulliganSetAside: [],
    });
    return state;
  }

  it("keeps the viewer's own hand and mulliganSetAside real", () => {
    const state = stateWithSecrets();
    const masked = toPublicGwentState(state, PLAYER_1);
    expect(getPlayer(masked, PLAYER_1).hand).toEqual(getPlayer(state, PLAYER_1).hand);
    expect(getPlayer(masked, PLAYER_1).mulliganSetAside).toEqual(getPlayer(state, PLAYER_1).mulliganSetAside);
  });

  it("masks the opponent's hand and mulliganSetAside (same length, sentinel defId)", () => {
    const state = stateWithSecrets();
    const masked = toPublicGwentState(state, PLAYER_1);
    const opponentHand = getPlayer(masked, PLAYER_2).hand;
    expect(opponentHand).toHaveLength(2);
    expect(opponentHand.every((c) => c.defId === HIDDEN_CARD_DEF_ID)).toBe(true);
  });

  it('always masks BOTH decks, regardless of viewer — nobody sees their own deck order, not even its owner', () => {
    const state = stateWithSecrets();
    const masked = toPublicGwentState(state, PLAYER_1);
    expect(getPlayer(masked, PLAYER_1).deck).toHaveLength(2);
    expect(getPlayer(masked, PLAYER_1).deck.every((c) => c.defId === HIDDEN_CARD_DEF_ID)).toBe(true);
    expect(getPlayer(masked, PLAYER_2).deck).toHaveLength(1);
    expect(getPlayer(masked, PLAYER_2).deck.every((c) => c.defId === HIDDEN_CARD_DEF_ID)).toBe(true);
  });

  it("viewerId null masks both sides' hand, deck, and mulliganSetAside — the neutral shared view", () => {
    const state = stateWithSecrets();
    const masked = toPublicGwentState(state, null);
    expect(getPlayer(masked, PLAYER_1).hand.every((c) => c.defId === HIDDEN_CARD_DEF_ID)).toBe(true);
    expect(getPlayer(masked, PLAYER_2).hand.every((c) => c.defId === HIDDEN_CARD_DEF_ID)).toBe(true);
    expect(getPlayer(masked, PLAYER_1).deck.every((c) => c.defId === HIDDEN_CARD_DEF_ID)).toBe(true);
    expect(getPlayer(masked, PLAYER_2).deck.every((c) => c.defId === HIDDEN_CARD_DEF_ID)).toBe(true);
  });

  it('leaves board/discard/log/phase untouched', () => {
    let state = stateWithSecrets();
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('board-a', HERO)] });
    state = updatePlayer(state, PLAYER_1, { discard: [card('discard-a', HERO)] });
    const masked = toPublicGwentState(state, PLAYER_2);
    expect(getPlayer(masked, PLAYER_1).board.Melee.cards).toEqual(getPlayer(state, PLAYER_1).board.Melee.cards);
    expect(getPlayer(masked, PLAYER_1).discard).toEqual(getPlayer(state, PLAYER_1).discard);
    expect(masked.log).toEqual(state.log);
    expect(masked.phase).toBe(state.phase);
  });
});

describe('expectedViewerId', () => {
  it('MULLIGAN: the not-yet-confirmed player, seat order first', () => {
    let state = baseTestState();
    expect(expectedViewerId(state)).toBe(PLAYER_1);
    state = updatePlayer(state, PLAYER_1, { mulliganConfirmed: true });
    expect(expectedViewerId(state)).toBe(PLAYER_2);
  });

  it('ROUND_IN_PROGRESS / AWAITING_START_CHOICE: the current player', () => {
    let state: GwentState = { ...baseTestState(), phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: 1 };
    expect(expectedViewerId(state)).toBe(PLAYER_2);
    state = { ...state, phase: 'AWAITING_START_CHOICE' };
    expect(expectedViewerId(state)).toBe(PLAYER_2);
  });

  it('ROUND_RESOLVED / FINISHED: no gate (null) — nothing hidden is on screen', () => {
    let state: GwentState = { ...baseTestState(), phase: 'ROUND_RESOLVED' };
    expect(expectedViewerId(state)).toBeNull();
    state = { ...state, phase: 'FINISHED' };
    expect(expectedViewerId(state)).toBeNull();
  });
});
