import { getCardDef } from './cardDefs';
import type { GwentState, PlayerId } from './state';
import {
  applyWeatherEffect,
  appendLog,
  computeRowTotal,
  destroyStrongestAcross,
  getOpponent,
  getPlayer,
  getCurrentPlayer,
  updatePlayer,
} from './rules';
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
  FOLTEST_THE_STEEL_FORGED,
  FRANCESCA_PUREBLOOD_ELF,
  FRANCESCA_QUEEN_OF_DOL_BLATHANNA,
} from './leaderConstants';
import { BITING_FROST_CARD_ID, IMPENETRABLE_FOG_CARD_ID, TORRENTIAL_RAIN_CARD_ID } from './specialCardIds';

/**
 * Category A leader abilities (one-shot, `ACTIVATE_LEADER_ABILITY`, consumes
 * the turn — see leaderConstants.ts). Depends on rules.ts helpers, so this
 * file must NOT be imported by rules.ts (that's what leaderPassives.ts is
 * for, category B) — see docs/gwent-0a-specifikacio.md §"Gwent-0a.2".
 *
 * Every handler assumes `canActivateLeaderAbility` already checked general
 * eligibility (phase/turn/not-used-yet) — a handler may still no-op on its
 * OWN, ability-specific target (e.g. the deck no longer has the weather
 * card) without failing the whole activation, matching the real game: the
 * leader ability is consumed regardless of whether it found a valid target.
 */
export type LeaderAbilityHandler = (
  state: GwentState,
  playerId: PlayerId,
  targetInstanceId: string | undefined,
  secondaryInstanceIds: string[] | undefined,
) => GwentState;

function playWeatherCardFromDeckById(state: GwentState, playerId: PlayerId, weatherCardId: string): GwentState {
  const player = getPlayer(state, playerId);
  const card = player.deck.find((c) => c.defId === weatherCardId);
  if (!card) return state;
  const next = updatePlayer(state, playerId, { deck: player.deck.filter((c) => c.instanceId !== card.instanceId) });
  return applyWeatherEffect(next, getCardDef(weatherCardId).weatherRow ?? 'AllRows');
}

function rowScorchIfThreshold(state: GwentState, playerId: PlayerId, row: 'Melee' | 'Ranged' | 'Siege'): GwentState {
  const opponent = getOpponent(state, playerId);
  if (computeRowTotal(state, opponent.id, row) < 10) return state;
  const result = destroyStrongestAcross(state, [{ playerId: opponent.id, row }]);
  let next = appendLog(result.state, { type: 'ROW_SCORCH_RESOLVED', playerId, row, destroyedInstanceIds: result.destroyedInstanceIds });
  for (const replacement of result.cowReplacements) {
    next = appendLog(next, { type: 'COW_REPLACED', playerId: replacement.playerId, row: replacement.row, newInstanceId: replacement.newInstanceId });
  }
  return next;
}

export const LEADER_ABILITIES: Record<string, LeaderAbilityHandler> = {
  [FOLTEST_KING_OF_TEMERIA]: (state, playerId) => playWeatherCardFromDeckById(state, playerId, IMPENETRABLE_FOG_CARD_ID),
  [FOLTEST_LORD_COMMANDER_OF_THE_NORTH]: (state) => applyWeatherEffect(state, 'AllRows'),
  [FOLTEST_SON_OF_MEDELL]: (state, playerId) => rowScorchIfThreshold(state, playerId, 'Ranged'),
  [FOLTEST_THE_STEEL_FORGED]: (state, playerId) => rowScorchIfThreshold(state, playerId, 'Siege'),
  [EMHYR_HIS_IMPERIAL_MAJESTY]: (state, playerId) => playWeatherCardFromDeckById(state, playerId, TORRENTIAL_RAIN_CARD_ID),

  [EMHYR_EMPEROR_OF_NILFGAARD]: (state, playerId) => {
    const opponent = getOpponent(state, playerId);
    const revealedDefIds = [...opponent.hand]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((c) => c.defId);
    return appendLog(state, { type: 'LEADER_REVEALED_OPPONENT_HAND', playerId, revealedDefIds });
  },

  [EMHYR_THE_RELENTLESS]: (state, playerId, targetInstanceId) => {
    if (!targetInstanceId) return state;
    const opponent = getOpponent(state, playerId);
    const card = opponent.discard.find((c) => c.instanceId === targetInstanceId);
    if (!card) return state;
    let next = updatePlayer(state, opponent.id, { discard: opponent.discard.filter((c) => c.instanceId !== targetInstanceId) });
    const player = getPlayer(next, playerId);
    next = updatePlayer(next, playerId, { hand: [...player.hand, card] });
    return appendLog(next, { type: 'CARD_RESTORED_FROM_DISCARD', playerId, instanceId: card.instanceId, defId: card.defId, fromOpponentDiscard: true });
  },

  [EMHYR_THE_WHITE_FLAME]: (state, playerId) => {
    const opponent = getOpponent(state, playerId);
    const next = updatePlayer(state, opponent.id, { leaderAbilityUsed: true });
    return appendLog(next, { type: 'LEADER_ABILITY_CANCELED', playerId, canceledPlayerId: opponent.id });
  },

  [EREDIN_BRINGER_OF_DEATH]: (state, playerId, targetInstanceId, secondaryInstanceIds) => {
    const player = getPlayer(state, playerId);
    const discardIds = secondaryInstanceIds ?? [];
    const toDiscard = player.hand.filter((c) => discardIds.includes(c.instanceId));
    if (toDiscard.length !== 2 || !targetInstanceId) return state;
    const drawnCard = player.deck.find((c) => c.instanceId === targetInstanceId);
    if (!drawnCard) return state;
    const remainingHand = player.hand.filter((c) => !discardIds.includes(c.instanceId));
    return updatePlayer(state, playerId, {
      hand: [...remainingHand, drawnCard],
      discard: [...player.discard, ...toDiscard],
      deck: player.deck.filter((c) => c.instanceId !== targetInstanceId),
    });
  },

  [EREDIN_COMMANDER_OF_THE_RED_RIDERS]: (state, playerId, targetInstanceId) => {
    if (!targetInstanceId) return state;
    const player = getPlayer(state, playerId);
    const card = player.deck.find((c) => c.instanceId === targetInstanceId);
    if (!card || getCardDef(card.defId).kind !== 'Weather') return state;
    const next = updatePlayer(state, playerId, { deck: player.deck.filter((c) => c.instanceId !== targetInstanceId) });
    return applyWeatherEffect(next, getCardDef(card.defId).weatherRow ?? 'AllRows');
  },

  [EREDIN_DESTROYER_OF_WORLDS]: (state, playerId, targetInstanceId) => {
    if (!targetInstanceId) return state;
    const player = getPlayer(state, playerId);
    const card = player.discard.find((c) => c.instanceId === targetInstanceId);
    if (!card) return state;
    const next = updatePlayer(state, playerId, {
      discard: player.discard.filter((c) => c.instanceId !== targetInstanceId),
      hand: [...player.hand, card],
    });
    return appendLog(next, { type: 'CARD_RESTORED_FROM_DISCARD', playerId, instanceId: card.instanceId, defId: card.defId, fromOpponentDiscard: false });
  },

  [FRANCESCA_PUREBLOOD_ELF]: (state, playerId) => playWeatherCardFromDeckById(state, playerId, BITING_FROST_CARD_ID),
  [FRANCESCA_QUEEN_OF_DOL_BLATHANNA]: (state, playerId) => rowScorchIfThreshold(state, playerId, 'Melee'),
};

export function canActivateLeaderAbility(state: GwentState, playerId: PlayerId): boolean {
  if (state.phase !== 'ROUND_IN_PROGRESS') return false;
  const player = getPlayer(state, playerId);
  if (getCurrentPlayer(state).id !== playerId || player.passed || player.leaderAbilityUsed) return false;
  return player.leaderId in LEADER_ABILITIES;
}

/** Runs the handler, then unconditionally marks the ability used and logs the activation — the real game consumes it even if the specific target/fizzle case had no effect. */
export function applyLeaderAbility(
  state: GwentState,
  playerId: PlayerId,
  targetInstanceId: string | undefined,
  secondaryInstanceIds: string[] | undefined,
): GwentState {
  const player = getPlayer(state, playerId);
  const handler = LEADER_ABILITIES[player.leaderId];
  let next = handler(state, playerId, targetInstanceId, secondaryInstanceIds);
  next = updatePlayer(next, playerId, { leaderAbilityUsed: true });
  return appendLog(next, { type: 'LEADER_ABILITY_ACTIVATED', playerId, abilityId: player.leaderId });
}
