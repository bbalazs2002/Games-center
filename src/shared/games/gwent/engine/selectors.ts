import { getCardDef } from './cardDefs';
import { HIDDEN_CARD_DEF_ID } from './specialCardIds';
import type { GwentState, PlayerId } from './state';
import { canActivateLeaderAbility } from './leaderAbilities';
import { agileAutoOptimizes } from './leaderPassives';
import {
  canAttemptToPlayCard,
  canConfirmMulligan,
  canContinueAfterRound,
  canFlipStartingCoin,
  canMulliganSwap,
  canPass,
  getCurrentPlayer,
  getPlayer,
  scoiaTaelDecisivePlayerId,
} from './rules';

export interface PlayableCardOption {
  instanceId: string;
  needsRowChoice: boolean;
  needsDecoyTarget: boolean;
  /** True only for a card with the Medic ability — the medicReviveInstanceIds field is always optional (omitting it just declines the revival). */
  canDeclineMedic: boolean;
}

export interface GwentValidActions {
  currentPlayerId: PlayerId;
  mulliganSwappableCardIds: string[];
  canConfirmMulligan: boolean;
  canFlipStartingCoin: boolean;
  /** Non-null only for the one player whose Scoia'tael bonus is deciding who starts this round. */
  startingChoicePlayerId: PlayerId | null;
  playableCards: PlayableCardOption[];
  canPass: boolean;
  canActivateLeaderAbility: boolean;
  canContinueAfterRound: boolean;
}

function playableCardOptions(state: GwentState, playerId: PlayerId): PlayableCardOption[] {
  const player = getPlayer(state, playerId);
  return player.hand
    // A masked hand (Gwent-0b, toPublicGwentState) — e.g. getValidActions
    // called with the ACTING player while a different player is the current
    // viewer, such as GwentGamePage's brief pass-device grace window (Gwent-0c)
    // — never has real cards to offer; getCardDef would throw on the sentinel.
    .filter((instance) => instance.defId !== HIDDEN_CARD_DEF_ID && canAttemptToPlayCard(state, playerId, instance.instanceId))
    .map((instance) => {
      const def = getCardDef(instance.defId);
      const isAgile = def.kind === 'Unit' && def.abilities.includes('Agile');
      return {
        instanceId: instance.instanceId,
        needsRowChoice: (isAgile && !agileAutoOptimizes(player)) || def.kind === 'Horn',
        needsDecoyTarget: def.kind === 'Decoy',
        canDeclineMedic: def.kind === 'Unit' && def.abilities.includes('Medic'),
      };
    });
}

/** Mirrors Hotel's `getValidActions` (HotelValidActions) — the single place the UI (and any future AI) reads what's legal right now, built from the exact same rules.ts predicates the reducer validates against. */
export function getValidActions(state: GwentState, viewerId: PlayerId): GwentValidActions {
  const player = getPlayer(state, viewerId);
  return {
    currentPlayerId: getCurrentPlayer(state).id,
    mulliganSwappableCardIds: player.hand.filter((c) => canMulliganSwap(state, viewerId, c.instanceId)).map((c) => c.instanceId),
    canConfirmMulligan: canConfirmMulligan(state, viewerId),
    canFlipStartingCoin: canFlipStartingCoin(state),
    startingChoicePlayerId: state.phase === 'AWAITING_START_CHOICE' ? scoiaTaelDecisivePlayerId(state) : null,
    playableCards: playableCardOptions(state, viewerId),
    canPass: canPass(state, viewerId),
    canActivateLeaderAbility: canActivateLeaderAbility(state, viewerId),
    canContinueAfterRound: canContinueAfterRound(state),
  };
}
