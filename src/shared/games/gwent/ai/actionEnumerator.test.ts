import { describe, expect, it } from 'vitest';
import { enumerateCandidateActions } from './actionEnumerator';
import { canActivateLeaderAbility } from '../engine/leaderAbilities';
import { EMHYR_THE_RELENTLESS } from '../engine/leaderConstants';
import { canPlayCard, updateBoardRow, updatePlayer } from '../engine/rules';
import { DECOY_CARD_ID, HORN_CARD_ID } from '../engine/specialCardIds';
import { baseTestState, card, PLAYER_1, PLAYER_2 } from '../engine/testHelpers';
import type { GwentAction } from '../engine/actions';
import type { GwentState } from '../engine/state';

const TIGHT_BOND = 'nilfgaard-impera-brigade-guard'; // power 3, Melee
const MEDIC = 'nilfgaard-etolian-auxiliary-archers'; // power 1, Ranged, Medic
const AGILE = 'monsters-celaeno-harpy'; // power 2, Agile
const HERO = 'monsters-draug'; // power 10, Melee, Hero
const WEAK_VANILLA = 'northern-realms-redanian-foot-soldier'; // power 1, no abilities — the lowest-value legal Medic target in the catalog

function readyState(): GwentState {
  return { ...baseTestState(), phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: 0 };
}

/** Every candidate the enumerator returns must be something the reducer would actually accept — same guarantee as Hotel/Ramses's enumerators. */
function expectAllLegal(state: GwentState, playerId: typeof PLAYER_1, candidates: GwentAction[]): void {
  for (const action of candidates) {
    if (action.type === 'PLAY_CARD') {
      expect(canPlayCard(state, playerId, action.instanceId, action.chosenRow, action.decoyTargetInstanceId, action.medicReviveInstanceIds)).toBe(true);
    } else if (action.type === 'ACTIVATE_LEADER_ABILITY') {
      expect(canActivateLeaderAbility(state, playerId)).toBe(true);
    } else if (action.type === 'PASS') {
      expect(state.players.find((p) => p.id === playerId)?.passed).toBe(false);
    }
  }
}

describe('enumerateCandidateActions', () => {
  it('offers a plain playable card and PASS, nothing else', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', TIGHT_BOND)] });
    const candidates = enumerateCandidateActions(state, PLAYER_1);
    expectAllLegal(state, PLAYER_1, candidates);
    expect(candidates.some((a) => a.type === 'PLAY_CARD' && a.instanceId === 'a')).toBe(true);
    expect(candidates.some((a) => a.type === 'PASS')).toBe(true);
  });

  it('offers both row variants for an Agile unit', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('a', AGILE)] });
    const candidates = enumerateCandidateActions(state, PLAYER_1);
    expectAllLegal(state, PLAYER_1, candidates);
    const rows = candidates.filter((a) => a.type === 'PLAY_CARD' && a.instanceId === 'a').map((a) => (a as { chosenRow?: string }).chosenRow);
    expect(rows.sort()).toEqual(['Melee', 'Ranged']);
  });

  it('offers all 3 row variants for a Horn card', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('h', HORN_CARD_ID)] });
    const candidates = enumerateCandidateActions(state, PLAYER_1);
    expectAllLegal(state, PLAYER_1, candidates);
    const rows = candidates.filter((a) => a.type === 'PLAY_CARD' && a.instanceId === 'h').map((a) => (a as { chosenRow?: string }).chosenRow);
    expect(rows.sort()).toEqual(['Melee', 'Ranged', 'Siege']);
  });

  it('offers every own board card as a Decoy target', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { hand: [card('decoy', DECOY_CARD_ID)] });
    state = updateBoardRow(state, PLAYER_1, 'Melee', { cards: [card('board1', TIGHT_BOND)] });
    state = updateBoardRow(state, PLAYER_1, 'Ranged', { cards: [card('board2', TIGHT_BOND)] });
    const candidates = enumerateCandidateActions(state, PLAYER_1);
    expectAllLegal(state, PLAYER_1, candidates);
    const targets = candidates.filter((a) => a.type === 'PLAY_CARD' && a.instanceId === 'decoy').map((a) => (a as { decoyTargetInstanceId?: string }).decoyTargetInstanceId);
    expect(targets.sort()).toEqual(['board1', 'board2']);
  });

  it('a Medic card offers a decline option AND a greedy revival chain, both legal', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, {
      hand: [card('medic', MEDIC)],
      discard: [card('weak', TIGHT_BOND), card('deadHero', HERO)], // Hero isn't a legal Medic target — excluded by eligibleMedicTargets
    });
    const candidates = enumerateCandidateActions(state, PLAYER_1);
    expectAllLegal(state, PLAYER_1, candidates);
    const medicPlays = candidates.filter((a) => a.type === 'PLAY_CARD' && a.instanceId === 'medic');
    expect(medicPlays.some((a) => (a as { medicReviveInstanceIds?: string[] }).medicReviveInstanceIds === undefined)).toBe(true); // decline
    const chainPlay = medicPlays.find((a) => (a as { medicReviveInstanceIds?: string[] }).medicReviveInstanceIds !== undefined);
    expect((chainPlay as { medicReviveInstanceIds?: string[] })?.medicReviveInstanceIds).toEqual(['weak']); // Hero excluded, only 1 real candidate
  });

  it('the greedy Medic chain keeps going through consecutive Medic-ability discard cards', () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, {
      hand: [card('medic', MEDIC)],
      // medic2 (basePower 1 + Medic ability bonus) outscores the weak vanilla
      // filler (basePower 1, no abilities) — see cardValue.ts — so the chain
      // picks medic2 FIRST, and since medic2 is itself Medic, keeps going.
      discard: [card('medic2', MEDIC), card('filler', WEAK_VANILLA)],
    });
    const candidates = enumerateCandidateActions(state, PLAYER_1);
    expectAllLegal(state, PLAYER_1, candidates);
    const chainPlay = candidates.find(
      (a) => a.type === 'PLAY_CARD' && a.instanceId === 'medic' && (a as { medicReviveInstanceIds?: string[] }).medicReviveInstanceIds !== undefined,
    );
    const chain = (chainPlay as { medicReviveInstanceIds?: string[] })?.medicReviveInstanceIds;
    // Both discard-pile candidates make it into ONE chain (medic2 is itself
    // Medic, so the chain keeps going instead of stopping after the first
    // revival) — see docs/gwent-0e-ai-specifikacio.md §8.2 (felhasználói
    // korrekció, 2026-08-07). medic2 must be FIRST — that's what makes the
    // chain continue at all.
    expect(chain).toEqual(['medic2', 'filler']);
  });

  it("offers every opponent discard card as a target for Emhyr The Relentless", () => {
    let state = readyState();
    state = updatePlayer(state, PLAYER_1, { leaderId: EMHYR_THE_RELENTLESS, hand: [] });
    state = updatePlayer(state, PLAYER_2, { discard: [card('d1', TIGHT_BOND), card('d2', MEDIC)] });
    const candidates = enumerateCandidateActions(state, PLAYER_1);
    expectAllLegal(state, PLAYER_1, candidates);
    const targets = candidates
      .filter((a) => a.type === 'ACTIVATE_LEADER_ABILITY')
      .map((a) => (a as { targetInstanceId?: string }).targetInstanceId);
    expect(targets.sort()).toEqual(['d1', 'd2']);
  });

  it('offers only PASS when the hand is empty and no leader ability is available', () => {
    const state = readyState();
    const candidates = enumerateCandidateActions(state, PLAYER_1);
    expect(candidates).toEqual([{ type: 'PASS', playerId: PLAYER_1 }]);
  });
});
