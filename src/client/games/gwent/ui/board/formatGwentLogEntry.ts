import { getCardDef } from '@shared/games/gwent/engine/cardDefs';
import { getLeaderDef } from '@shared/games/gwent/engine/leaderDefs';
import { getPlayer } from '@shared/games/gwent/engine/rules';
import type { GwentLogEntry, GwentState } from '@shared/games/gwent/engine/state';
import { rowLabel } from '@shared/games/gwent/engine/cardDisplay';

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

/** `Extract<GwentLogEntry, {type: K}>` — each formatter below only ever sees its own narrowed entry shape, same as a switch-case would, just split into one small function per case instead of one big branch each. */
type FormatterMap = {
  [K in GwentLogEntry['type']]: (entry: Extract<GwentLogEntry, { type: K }>, state: GwentState) => string;
};

/**
 * One formatter function per `GwentLogEntry` variant — replaces a single
 * 20-case switch (previously well past the project's complexity-10 ESLint
 * limit) with a dispatch table of small, individually-simple functions.
 * `FormatterMap`'s mapped type still forces this object to cover every
 * variant, so it's exactly as exhaustive-checked as the old switch's
 * `(entry satisfies never)` default case.
 */
const FORMATTERS: FormatterMap = {
  MULLIGAN_SWAPPED: (entry, state) => `${playerName(state, entry.playerId)} kicserélt egy lapot a kezdő kezében.`,
  MULLIGAN_CONFIRMED: (entry, state) => `${playerName(state, entry.playerId)} lezárta a kezdő kezét.`,
  STARTING_COIN_FLIP: (entry, state) =>
    `Érmedobás: ${entry.result === 'castle' ? 'kastély' : 'fáklya'} — ${playerName(state, entry.startingPlayerId)} kezd.`,
  STARTING_PLAYER_CHOSEN: (entry, state) => `${playerName(state, entry.chooserId)} eldöntötte: ${playerName(state, entry.startingPlayerId)} kezd.`,
  CARD_PLAYED: (entry, state) =>
    `${playerName(state, entry.playerId)} kijátszotta: ${cardName(entry.defId)} (${rowLabel(entry.row) ?? entry.row}${
      entry.ownerRowPlayerId !== entry.playerId ? ', az ellenfél oldalára' : ''
    }).`,
  CARD_MOVED_TO_OPPONENT: (entry) => `${cardName(entry.defId)} átkerült az ellenfél oldalára (${rowLabel(entry.row) ?? entry.row}).`,
  CARDS_DRAWN: (entry, state) => `${playerName(state, entry.playerId)} húzott ${entry.count} lapot (${DRAW_REASON_LABELS[entry.reason]}).`,
  MUSTER_TRIGGERED: (entry, state) => `${playerName(state, entry.playerId)} Muster-képessége ${entry.playedInstanceIds.length} további lapot hozott be.`,
  MEDIC_REVIVED: (entry, state) =>
    `${playerName(state, entry.playerId)} Medic-képessége feltámasztotta: ${cardName(entry.defId)}${entry.wasRandom ? ' (véletlenszerű)' : ''}.`,
  DECOY_SWAPPED: (entry, state) => `${playerName(state, entry.playerId)} Csalit használt: visszavette ${cardName(entry.returnedDefId)} lapját.`,
  WEATHER_APPLIED: (entry, state) => `${playerName(state, entry.playerId)} időjárás-hatást aktivált (${rowLabel(entry.row) ?? entry.row}).`,
  WEATHER_CLEARED: (entry, state) => `${playerName(state, entry.playerId)} eltisztította az időjárást.`,
  SCORCH_RESOLVED: (entry) => `Scorch: ${entry.destroyedInstanceIds.length} lap megsemmisült.`,
  ROW_SCORCH_RESOLVED: (entry) => `Sor-Scorch (${rowLabel(entry.row) ?? entry.row}): ${entry.destroyedInstanceIds.length} lap megsemmisült.`,
  COW_REPLACED: (entry) => `A tehén lecserélődött Bovine Defense Force-ra (${rowLabel(entry.row) ?? entry.row}).`,
  LEADER_ABILITY_ACTIVATED: (entry, state) =>
    `${playerName(state, entry.playerId)} aktiválta vezér-képességét: ${getLeaderDef(getPlayer(state, entry.playerId).leaderId).name}.`,
  LEADER_REVEALED_OPPONENT_HAND: (entry, state) => `${playerName(state, entry.playerId)} felfedte az ellenfél kezét.`,
  LEADER_ABILITY_CANCELED: (entry, state) =>
    `${playerName(state, entry.playerId)} semlegesítette ${playerName(state, entry.canceledPlayerId)} vezér-képességét.`,
  CARD_RESTORED_FROM_DISCARD: (entry, state) =>
    `${playerName(state, entry.playerId)} visszahozott egy lapot a ${entry.fromOpponentDiscard ? 'ellenfél' : 'saját'} dobott lapjai közül: ${cardName(entry.defId)}.`,
  PASSED: (entry, state) => `${playerName(state, entry.playerId)} passzolt.`,
  ROUND_RESOLVED: (entry, state) =>
    entry.tie ? `${entry.round}. kör döntetlen.` : `${entry.round}. kör vége — ${playerName(state, entry.winnerId as string)} nyerte.`,
  GAME_WON: (entry, state) => `${playerName(state, entry.winnerId)} megnyerte a mérkőzést!`,
};

/** One readable Hungarian line per `GwentLogEntry` variant — the Gwent equivalent of Hotel's `formatLogEntry.ts` (Gwent-0c.1 §F, 16. pont). */
export function formatGwentLogEntry(entry: GwentLogEntry, state: GwentState): string {
  // The cast is needed because TS can't distribute a discriminated union's
  // narrowed parameter type through a dynamic `entry.type` index lookup —
  // the FormatterMap's mapped type already guarantees, at the object-literal
  // definition above, that every formatter matches its own key's shape.
  const formatter = FORMATTERS[entry.type] as (entry: GwentLogEntry, state: GwentState) => string;
  return formatter(entry, state);
}
