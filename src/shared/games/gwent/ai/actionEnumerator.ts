import { getCardDef } from '../engine/cardDefs';
import type { GwentAction } from '../engine/actions';
import {
  EMHYR_THE_RELENTLESS,
  EREDIN_BRINGER_OF_DEATH,
  EREDIN_COMMANDER_OF_THE_RED_RIDERS,
  EREDIN_DESTROYER_OF_WORLDS,
} from '../engine/leaderConstants';
import { eligibleMedicTargets, getOpponent, getPlayer, ROWS } from '../engine/rules';
import { getValidActions, type PlayableCardOption } from '../engine/selectors';
import type { CardInstance, GwentState, PlayerId } from '../engine/state';
import type { Row } from '../engine/types';
import { estimateCardValue } from './cardValue';

/**
 * Greedily builds the highest-value revival chain starting from the best
 * discard candidate — see docs/gwent-0e-ai-specifikacio.md §8.2 (felhasználói
 * korrekció, 2026-08-07): if the picked target is itself Medic, keep chaining
 * through the best REMAINING discard-pile card, since every extra link is a
 * free additional card placed on the board (reducer.ts's resolveMedic
 * re-triggers the full on-play pipeline recursively for each link). Stops the
 * moment the current pick isn't Medic, or no eligible card remains.
 */
function buildGreedyMedicChain(eligible: CardInstance[]): string[] {
  const remaining = [...eligible];
  const chain: string[] = [];
  let keepChaining = true;
  while (keepChaining && remaining.length > 0) {
    remaining.sort((a, b) => estimateCardValue(getCardDef(b.defId)) - estimateCardValue(getCardDef(a.defId)));
    const next = remaining.shift()!;
    chain.push(next.instanceId);
    keepChaining = getCardDef(next.defId).abilities.includes('Medic');
  }
  return chain;
}

function playCardVariants(state: GwentState, playerId: PlayerId, option: PlayableCardOption): GwentAction[] {
  const player = getPlayer(state, playerId);
  const instance = player.hand.find((c) => c.instanceId === option.instanceId);
  if (!instance) return [];
  const def = getCardDef(instance.defId);

  if (option.needsRowChoice) {
    const rows: Row[] = def.kind === 'Horn' ? ROWS : ['Melee', 'Ranged'];
    return rows.map((chosenRow) => ({ type: 'PLAY_CARD', playerId, instanceId: option.instanceId, chosenRow }));
  }

  if (option.needsDecoyTarget) {
    // Heroes are immune to Decoy (rules.ts's isDecoyChoiceValid) — excluded here too, so every
    // candidate stays legal (this module's whole-file guarantee, see the doc comment below).
    const ownBoardCards = ROWS.flatMap((row) => player.board[row].cards).filter((c) => !getCardDef(c.defId).abilities.includes('Hero'));
    return ownBoardCards.map((target) => ({
      type: 'PLAY_CARD',
      playerId,
      instanceId: option.instanceId,
      decoyTargetInstanceId: target.instanceId,
    }));
  }

  if (option.canDeclineMedic) {
    const decline: GwentAction = { type: 'PLAY_CARD', playerId, instanceId: option.instanceId };
    const eligible = eligibleMedicTargets(player);
    if (eligible.length === 0) return [decline];
    const chain = buildGreedyMedicChain(eligible);
    return [decline, { type: 'PLAY_CARD', playerId, instanceId: option.instanceId, medicReviveInstanceIds: chain }];
  }

  return [{ type: 'PLAY_CARD', playerId, instanceId: option.instanceId }];
}

/** Only the 2 target-needing leaders in each direction — every other Category A ability needs no target (see leaderAbilities.ts's LEADER_ABILITIES). */
function leaderAbilityCandidates(state: GwentState, slot: PlayerId): GwentAction[] {
  const valid = getValidActions(state, slot);
  if (!valid.canActivateLeaderAbility) return [];
  const player = getPlayer(state, slot);
  const base = { type: 'ACTIVATE_LEADER_ABILITY' as const, playerId: slot };

  switch (player.leaderId) {
    case EMHYR_THE_RELENTLESS:
      return getOpponent(state, slot).discard.map((card) => ({ ...base, targetInstanceId: card.instanceId }));
    case EREDIN_DESTROYER_OF_WORLDS:
      return player.discard.map((card) => ({ ...base, targetInstanceId: card.instanceId }));
    case EREDIN_COMMANDER_OF_THE_RED_RIDERS: {
      // `player.deck` is real here — the caller (strategy.ts's stateForAiDecision)
      // leaves the ACTING player's own deck unmasked, exactly like a human's
      // requestDeckReveal at the moment of activating this ability.
      const weatherCards = player.deck.filter((card) => getCardDef(card.defId).kind === 'Weather');
      return weatherCards.map((card) => ({ ...base, targetInstanceId: card.instanceId }));
    }
    case EREDIN_BRINGER_OF_DEATH: {
      if (player.hand.length < 2 || player.deck.length === 0) return [];
      const [weakestA, weakestB] = [...player.hand].sort(
        (a, b) => estimateCardValue(getCardDef(a.defId)) - estimateCardValue(getCardDef(b.defId)),
      );
      const bestDraw = [...player.deck].sort((a, b) => estimateCardValue(getCardDef(b.defId)) - estimateCardValue(getCardDef(a.defId)))[0];
      return [{ ...base, targetInstanceId: bestDraw.instanceId, secondaryInstanceIds: [weakestA.instanceId, weakestB.instanceId] }];
    }
    default:
      return [base];
  }
}

/**
 * Every concrete, LEGAL action `slot` could take right now, fully parameterized
 * (row/decoy target/Medic chain/leader-ability target) — built entirely from
 * `getValidActions`/`rules.ts` predicates, so this can never produce an
 * action the reducer would reject (same guarantee as Hotel/Ramses's
 * enumerators). See docs/gwent-0e-ai-specifikacio.md §8.2.
 */
export function enumerateCandidateActions(state: GwentState, slot: PlayerId): GwentAction[] {
  const valid = getValidActions(state, slot);
  const candidates: GwentAction[] = [];

  for (const option of valid.playableCards) candidates.push(...playCardVariants(state, slot, option));
  candidates.push(...leaderAbilityCandidates(state, slot));
  if (valid.canPass) candidates.push({ type: 'PASS', playerId: slot });

  return candidates;
}
