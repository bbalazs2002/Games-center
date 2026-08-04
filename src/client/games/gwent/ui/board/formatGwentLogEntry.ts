import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import { getLeaderDef } from '../../../../../shared/games/gwent/engine/leaderDefs';
import { getPlayer } from '../../../../../shared/games/gwent/engine/rules';
import type { GwentLogEntry, GwentState } from '../../../../../shared/games/gwent/engine/state';
import { rowLabel } from '../cardDisplay';

const DRAW_REASON_LABELS: Record<'SPY' | 'ROUND_WON_BONUS' | 'MULLIGAN', string> = {
  SPY: 'Kém-hatás',
  ROUND_WON_BONUS: 'kör-győzelmi bónusz',
  MULLIGAN: 'kezdő kéz feltöltése',
};

function playerName(state: GwentState, playerId: string): string {
  return getPlayer(state, playerId).name;
}

function cardName(defId: string): string {
  return getCardDef(defId).name;
}

/** One readable Hungarian line per `GwentLogEntry` variant — the Gwent equivalent of Hotel's `formatLogEntry.ts` (Gwent-0c.1 §F, 16. pont). */
export function formatGwentLogEntry(entry: GwentLogEntry, state: GwentState): string {
  switch (entry.type) {
    case 'MULLIGAN_SWAPPED':
      return `${playerName(state, entry.playerId)} kicserélt egy lapot a kezdő kezében.`;
    case 'MULLIGAN_CONFIRMED':
      return `${playerName(state, entry.playerId)} lezárta a kezdő kezét.`;
    case 'STARTING_COIN_FLIP':
      return `Érmedobás: ${entry.result === 'castle' ? 'kastély' : 'fáklya'} — ${playerName(state, entry.startingPlayerId)} kezd.`;
    case 'STARTING_PLAYER_CHOSEN':
      return `${playerName(state, entry.chooserId)} eldöntötte: ${playerName(state, entry.startingPlayerId)} kezd.`;
    case 'CARD_PLAYED':
      return `${playerName(state, entry.playerId)} kijátszotta: ${cardName(entry.defId)} (${rowLabel(entry.row) ?? entry.row}${entry.ownerRowPlayerId !== entry.playerId ? ', az ellenfél oldalára' : ''}).`;
    case 'CARD_MOVED_TO_OPPONENT':
      return `${cardName(entry.defId)} átkerült az ellenfél oldalára (${rowLabel(entry.row) ?? entry.row}).`;
    case 'CARDS_DRAWN':
      return `${playerName(state, entry.playerId)} húzott ${entry.count} lapot (${DRAW_REASON_LABELS[entry.reason]}).`;
    case 'MUSTER_TRIGGERED':
      return `${playerName(state, entry.playerId)} Muster-képessége ${entry.playedInstanceIds.length} további lapot hozott be.`;
    case 'MEDIC_REVIVED':
      return `${playerName(state, entry.playerId)} Medic-képessége feltámasztotta: ${cardName(entry.defId)}${entry.wasRandom ? ' (véletlenszerű)' : ''}.`;
    case 'DECOY_SWAPPED':
      return `${playerName(state, entry.playerId)} Csalit használt: visszavette ${cardName(entry.returnedDefId)} lapját.`;
    case 'WEATHER_APPLIED':
      return `${playerName(state, entry.playerId)} időjárás-hatást aktivált (${rowLabel(entry.row) ?? entry.row}).`;
    case 'WEATHER_CLEARED':
      return `${playerName(state, entry.playerId)} eltisztította az időjárást.`;
    case 'SCORCH_RESOLVED':
      return `Scorch: ${entry.destroyedInstanceIds.length} lap megsemmisült.`;
    case 'ROW_SCORCH_RESOLVED':
      return `Sor-Scorch (${rowLabel(entry.row) ?? entry.row}): ${entry.destroyedInstanceIds.length} lap megsemmisült.`;
    case 'COW_REPLACED':
      return `A tehén lecserélődött Bovine Defense Force-ra (${rowLabel(entry.row) ?? entry.row}).`;
    case 'LEADER_ABILITY_ACTIVATED':
      return `${playerName(state, entry.playerId)} aktiválta vezér-képességét: ${getLeaderDef(getPlayer(state, entry.playerId).leaderId).name}.`;
    case 'LEADER_REVEALED_OPPONENT_HAND':
      return `${playerName(state, entry.playerId)} felfedte az ellenfél kezét.`;
    case 'LEADER_ABILITY_CANCELED':
      return `${playerName(state, entry.playerId)} semlegesítette ${playerName(state, entry.canceledPlayerId)} vezér-képességét.`;
    case 'CARD_RESTORED_FROM_DISCARD':
      return `${playerName(state, entry.playerId)} visszahozott egy lapot a ${entry.fromOpponentDiscard ? 'ellenfél' : 'saját'} dobott lapjai közül: ${cardName(entry.defId)}.`;
    case 'PASSED':
      return `${playerName(state, entry.playerId)} passzolt.`;
    case 'ROUND_RESOLVED':
      return entry.tie
        ? `${entry.round}. kör döntetlen.`
        : `${entry.round}. kör vége — ${playerName(state, entry.winnerId as string)} nyerte.`;
    case 'GAME_WON':
      return `${playerName(state, entry.winnerId)} megnyerte a mérkőzést!`;
    default:
      return (entry satisfies never) && '';
  }
}
