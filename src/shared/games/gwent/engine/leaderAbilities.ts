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
import { leaderAbilityCanceledByOpponent } from './leaderPassives';
import { BITING_FROST_CARD_ID, IMPENETRABLE_FOG_CARD_ID, TORRENTIAL_RAIN_CARD_ID } from './specialCardIds';

/**
 * Category A leader abilities (one-shot, `ACTIVATE_LEADER_ABILITY`, consumes
 * the turn — see leaderConstants.ts). Depends on rules.ts helpers, so this
 * file must NOT be imported by rules.ts (that's what leaderPassives.ts is
 * for, category B) — see docs/gwent-0a-specifikacio.md §"Gwent-0a.2".
 *
 * Every handler assumes `canActivateLeaderAbility` already checked general
 * eligibility (phase/turn/not-used-yet) — a handler may still no-op on its
 * OWN, ability-specific target. Real playtest report (2026-08-08): a fizzled
 * activation must NOT still burn the ability (the earlier "consumed
 * regardless" design let a player permanently waste e.g. Foltest King of
 * Temeria by clicking it with no Impenetrable Fog left in the deck) — so
 * every handler now reports whether it actually did something via
 * `LeaderAbilityResult.succeeded`, and `applyLeaderAbility` only marks
 * `leaderAbilityUsed`/logs the activation when it did. Abilities whose
 * effect is a board/hand-state THRESHOLD check rather than a genuine missing
 * TARGET (row-scorch below 10, clearing weather when none is active,
 * revealing an opponent hand that's smaller than 3) always succeed — that
 * matches the real game, where "no visible effect" is still a legitimate,
 * deliberate use of the ability, unlike "the specific card/pile/target this
 * ability needs simply doesn't exist right now."
 */
export interface LeaderAbilityResult {
  state: GwentState;
  /**
   * False when the ability's own required target/precondition wasn't met —
   * `applyLeaderAbility` leaves `leaderAbilityUsed` false in that case, so
   * the ability stays available rather than being silently burned. True for
   * every "may have no visible effect, but was still a legitimate attempt"
   * ability (see file doc comment).
   */
  succeeded: boolean;
}

export type LeaderAbilityHandler = (
  state: GwentState,
  playerId: PlayerId,
  targetInstanceId: string | undefined,
  secondaryInstanceIds: string[] | undefined,
) => LeaderAbilityResult;

/** Always succeeds — no target dependency, only ever "may have no visible effect" (see file doc comment). */
function alwaysSucceeds(state: GwentState): LeaderAbilityResult {
  return { state, succeeded: true };
}

function playWeatherCardFromDeckById(state: GwentState, playerId: PlayerId, weatherCardId: string): LeaderAbilityResult {
  const player = getPlayer(state, playerId);
  const card = player.deck.find((c) => c.defId === weatherCardId);
  if (!card) return { state, succeeded: false };
  const next = updatePlayer(state, playerId, { deck: player.deck.filter((c) => c.instanceId !== card.instanceId) });
  return { state: applyWeatherEffect(next, getCardDef(weatherCardId).weatherRow ?? 'AllRows'), succeeded: true };
}

/** Row-scorch leader abilities always succeed even below the threshold — a board-state THRESHOLD, not a missing TARGET (see file doc comment). */
function rowScorchIfThreshold(state: GwentState, playerId: PlayerId, row: 'Melee' | 'Ranged' | 'Siege'): LeaderAbilityResult {
  const opponent = getOpponent(state, playerId);
  if (computeRowTotal(state, opponent.id, row) < 10) return { state, succeeded: true };
  const result = destroyStrongestAcross(state, [{ playerId: opponent.id, row }]);
  let next = appendLog(result.state, { type: 'ROW_SCORCH_RESOLVED', playerId, row, destroyedInstanceIds: result.destroyedInstanceIds });
  for (const replacement of result.cowReplacements) {
    next = appendLog(next, { type: 'COW_REPLACED', playerId: replacement.playerId, row: replacement.row, newInstanceId: replacement.newInstanceId });
  }
  return { state: next, succeeded: true };
}

export const LEADER_ABILITIES: Record<string, LeaderAbilityHandler> = {
  [FOLTEST_KING_OF_TEMERIA]: (state, playerId) => playWeatherCardFromDeckById(state, playerId, IMPENETRABLE_FOG_CARD_ID),
  [FOLTEST_LORD_COMMANDER_OF_THE_NORTH]: (state) => alwaysSucceeds(applyWeatherEffect(state, 'AllRows')),
  [FOLTEST_SON_OF_MEDELL]: (state, playerId) => rowScorchIfThreshold(state, playerId, 'Ranged'),
  [FOLTEST_THE_STEEL_FORGED]: (state, playerId) => rowScorchIfThreshold(state, playerId, 'Siege'),
  [EMHYR_HIS_IMPERIAL_MAJESTY]: (state, playerId) => playWeatherCardFromDeckById(state, playerId, TORRENTIAL_RAIN_CARD_ID),

  [EMHYR_EMPEROR_OF_NILFGAARD]: (state, playerId) => {
    const opponent = getOpponent(state, playerId);
    const revealedDefIds = [...opponent.hand]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((c) => c.defId);
    return alwaysSucceeds(appendLog(state, { type: 'LEADER_REVEALED_OPPONENT_HAND', playerId, revealedDefIds }));
  },

  [EMHYR_THE_RELENTLESS]: (state, playerId, targetInstanceId) => {
    if (!targetInstanceId) return { state, succeeded: false };
    const opponent = getOpponent(state, playerId);
    const card = opponent.discard.find((c) => c.instanceId === targetInstanceId);
    if (!card) return { state, succeeded: false };
    let next = updatePlayer(state, opponent.id, { discard: opponent.discard.filter((c) => c.instanceId !== targetInstanceId) });
    const player = getPlayer(next, playerId);
    next = updatePlayer(next, playerId, { hand: [...player.hand, card] });
    return {
      state: appendLog(next, { type: 'CARD_RESTORED_FROM_DISCARD', playerId, instanceId: card.instanceId, defId: card.defId, fromOpponentDiscard: true }),
      succeeded: true,
    };
  },

  [EREDIN_BRINGER_OF_DEATH]: (state, playerId, targetInstanceId, secondaryInstanceIds) => {
    const player = getPlayer(state, playerId);
    const discardIds = secondaryInstanceIds ?? [];
    const toDiscard = player.hand.filter((c) => discardIds.includes(c.instanceId));
    if (toDiscard.length !== 2 || !targetInstanceId) return { state, succeeded: false };
    const drawnCard = player.deck.find((c) => c.instanceId === targetInstanceId);
    if (!drawnCard) return { state, succeeded: false };
    const remainingHand = player.hand.filter((c) => !discardIds.includes(c.instanceId));
    return {
      state: updatePlayer(state, playerId, {
        hand: [...remainingHand, drawnCard],
        discard: [...player.discard, ...toDiscard],
        deck: player.deck.filter((c) => c.instanceId !== targetInstanceId),
      }),
      succeeded: true,
    };
  },

  [EREDIN_COMMANDER_OF_THE_RED_RIDERS]: (state, playerId, targetInstanceId) => {
    if (!targetInstanceId) return { state, succeeded: false };
    const player = getPlayer(state, playerId);
    const card = player.deck.find((c) => c.instanceId === targetInstanceId);
    if (!card || getCardDef(card.defId).kind !== 'Weather') return { state, succeeded: false };
    const next = updatePlayer(state, playerId, { deck: player.deck.filter((c) => c.instanceId !== targetInstanceId) });
    return { state: applyWeatherEffect(next, getCardDef(card.defId).weatherRow ?? 'AllRows'), succeeded: true };
  },

  [EREDIN_DESTROYER_OF_WORLDS]: (state, playerId, targetInstanceId) => {
    if (!targetInstanceId) return { state, succeeded: false };
    const player = getPlayer(state, playerId);
    const card = player.discard.find((c) => c.instanceId === targetInstanceId);
    if (!card) return { state, succeeded: false };
    const next = updatePlayer(state, playerId, {
      discard: player.discard.filter((c) => c.instanceId !== targetInstanceId),
      hand: [...player.hand, card],
    });
    return {
      state: appendLog(next, { type: 'CARD_RESTORED_FROM_DISCARD', playerId, instanceId: card.instanceId, defId: card.defId, fromOpponentDiscard: false }),
      succeeded: true,
    };
  },

  [FRANCESCA_PUREBLOOD_ELF]: (state, playerId) => playWeatherCardFromDeckById(state, playerId, BITING_FROST_CARD_ID),
  [FRANCESCA_QUEEN_OF_DOL_BLATHANNA]: (state, playerId) => rowScorchIfThreshold(state, playerId, 'Melee'),
};

/**
 * Abilities whose target requirement is determinable from data the CLIENT
 * can always see — even in the acting player's own masked view (see
 * `toPublicGwentState`): discard piles are never masked, and hand/deck
 * *length* survives masking even though card *identity* doesn't. This is
 * deliberately narrower than "every ability that can fizzle" — the deck-
 * SEARCH abilities (Foltest King of Temeria, Emhyr His Imperial Majesty,
 * Francesca Pureblood Elf, Eredin Commander of the Red Riders) depend on
 * specific card IDENTITIES inside the deck, which stay masked even from the
 * deck's own owner (see LeaderAbilityPanel.tsx's doc comment) — gating THOSE
 * here would permanently disable the button client-side even when the real
 * (server-side) deck does have the card. Those rely solely on
 * `LeaderAbilityResult.succeeded` (above) to avoid burning the ability
 * instead — the player finds out by trying, same as not knowing your own
 * remaining deck order in the physical game.
 */
function hasKnowableTarget(state: GwentState, playerId: PlayerId, leaderId: string): boolean {
  const player = getPlayer(state, playerId);
  switch (leaderId) {
    case EMHYR_THE_RELENTLESS:
      return getOpponent(state, playerId).discard.length > 0;
    case EREDIN_DESTROYER_OF_WORLDS:
      return player.discard.length > 0;
    case EREDIN_BRINGER_OF_DEATH:
      return player.hand.length >= 2 && player.deck.length >= 1;
    default:
      return true;
  }
}

export function canActivateLeaderAbility(state: GwentState, playerId: PlayerId): boolean {
  if (state.phase !== 'ROUND_IN_PROGRESS') return false;
  const player = getPlayer(state, playerId);
  if (getCurrentPlayer(state).id !== playerId || player.passed || player.leaderAbilityUsed) return false;
  if (!(player.leaderId in LEADER_ABILITIES)) return false;
  // Emhyr The White Flame — the opponent's leader ability (this player's, in
  // this check) is canceled entirely, automatically, no exceptions (real
  // playtest correction, 2026-08-08 — see leaderConstants.ts's doc comment
  // and leaderPassives.ts's isLeaderAbilityCanceled). Both discard-pile
  // length and leaderId/leaderAbilityUsed are never masked, so this is safe
  // to check from the client's own masked view too.
  if (leaderAbilityCanceledByOpponent(state, playerId)) return false;
  return hasKnowableTarget(state, playerId, player.leaderId);
}

/** Runs the handler; only marks the ability used and logs the activation when it actually succeeded (see file doc comment) — a fizzled attempt (missing target) leaves the ability available. */
export function applyLeaderAbility(
  state: GwentState,
  playerId: PlayerId,
  targetInstanceId: string | undefined,
  secondaryInstanceIds: string[] | undefined,
): GwentState {
  const player = getPlayer(state, playerId);
  const handler = LEADER_ABILITIES[player.leaderId];
  const result = handler(state, playerId, targetInstanceId, secondaryInstanceIds);
  if (!result.succeeded) return result.state;
  const next = updatePlayer(result.state, playerId, { leaderAbilityUsed: true });
  return appendLog(next, { type: 'LEADER_ABILITY_ACTIVATED', playerId, abilityId: player.leaderId });
}
