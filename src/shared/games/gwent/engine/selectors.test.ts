import { describe, expect, it } from 'vitest';
import { getValidActions } from './selectors';
import { toPublicGwentState, updateBoardRow, updatePlayer } from './rules';
import { baseTestState, card, PLAYER_1, PLAYER_2 } from './testHelpers';
import { HORN_CARD_ID } from './specialCardIds';
import type { GwentState } from './state';

const TIGHT_BOND = 'nilfgaard-impera-brigade-guard';
const AGILE = 'monsters-celaeno-harpy';
const DECOY = 'neutral-decoy';
const MEDIC = 'nilfgaard-etolian-auxiliary-archers';

describe('getValidActions', () => {
  it('only offers mulligan-related actions during MULLIGAN', () => {
    let state = baseTestState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', TIGHT_BOND)] });
    const valid = getValidActions(state, PLAYER_1);
    expect(valid.mulliganSwappableCardIds).toEqual(['a']);
    expect(valid.canConfirmMulligan).toBe(true);
    expect(valid.playableCards).toEqual([]);
    expect(valid.canPass).toBe(false);
  });

  it('exposes the starting-choice state during AWAITING_START_CHOICE', () => {
    let state: GwentState = { ...baseTestState(), phase: 'AWAITING_START_CHOICE' };
    expect(getValidActions(state, PLAYER_1).canFlipStartingCoin).toBe(true);
    expect(getValidActions(state, PLAYER_1).startingChoicePlayerId).toBeNull();

    state = updatePlayer(state, PLAYER_2, { faction: 'Scoiatael' });
    expect(getValidActions(state, PLAYER_1).canFlipStartingCoin).toBe(false);
    expect(getValidActions(state, PLAYER_1).startingChoicePlayerId).toBe(PLAYER_2);
  });

  it('flags each playable card\'s row/decoy/medic requirements correctly', () => {
    let state: GwentState = { ...baseTestState(), phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: 0 };
    state = updatePlayer(state, PLAYER_1, { hand: [card('fixed', TIGHT_BOND), card('agile', AGILE), card('horn', HORN_CARD_ID), card('decoy', DECOY), card('medic', MEDIC)] });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('board', TIGHT_BOND)] });

    const valid = getValidActions(state, PLAYER_1);
    const byId = Object.fromEntries(valid.playableCards.map((p) => [p.instanceId, p]));
    expect(byId.fixed).toMatchObject({ needsRowChoice: false, needsDecoyTarget: false, canDeclineMedic: false });
    expect(byId.agile).toMatchObject({ needsRowChoice: true, needsDecoyTarget: false });
    expect(byId.horn).toMatchObject({ needsRowChoice: true });
    expect(byId.decoy).toMatchObject({ needsDecoyTarget: true });
    expect(byId.medic).toMatchObject({ canDeclineMedic: true });
    expect(valid.canPass).toBe(true);
  });

  it('never crashes when asked for the acting player while THEIR hand is masked from the caller-supplied viewer (Gwent-0c pass-device grace window)', () => {
    let state: GwentState = { ...baseTestState(), phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: 0 };
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', TIGHT_BOND)] });
    // toPublicGwentState(state, PLAYER_2) masks PLAYER_1's hand — exactly what
    // GwentGamePage's brief grace window (old activeViewerId=PLAYER_2, but
    // state.currentPlayerIndex already flipped to PLAYER_1) produces.
    const masked = toPublicGwentState(state, PLAYER_2);
    expect(() => getValidActions(masked, PLAYER_1)).not.toThrow();
    expect(getValidActions(masked, PLAYER_1).playableCards).toEqual([]);
  });

  it('canContinueAfterRound is only true in ROUND_RESOLVED', () => {
    const resolved: GwentState = { ...baseTestState(), phase: 'ROUND_RESOLVED' };
    expect(getValidActions(resolved, PLAYER_1).canContinueAfterRound).toBe(true);
    expect(getValidActions(baseTestState(), PLAYER_1).canContinueAfterRound).toBe(false);
  });
});
