import type { Row } from './types';
import type { GwentState, PlayerId, PlayerState } from './state';
import {
  EMHYR_INVADER_OF_THE_NORTH,
  EREDIN_BREACC_GLAS_THE_TREACHEROUS,
  EREDIN_KING_OF_THE_WILD_HUNT,
  FOLTEST_THE_SIEGEMASTER,
  FRANCESCA_HOPE_OF_THE_AEN_SEIDHE,
  FRANCESCA_THE_BEAUTIFUL,
} from './leaderConstants';

/**
 * Category B leader abilities (passive, always-on modifiers, no player
 * action) — kept dependency-free of rules.ts on purpose, to avoid a
 * rules.ts <-> leaderAbilities.ts import cycle (Category A one-shot handlers
 * in leaderAbilities.ts DO depend on rules.ts helpers). See
 * docs/gwent-0a-specifikacio.md §"Gwent-0a.2".
 */

function hasLeaderAbility(player: PlayerState, abilityId: string): boolean {
  return player.leaderId === abilityId;
}

const AUTO_HORN_ROW_BY_ABILITY: Record<string, Row> = {
  [FOLTEST_THE_SIEGEMASTER]: 'Siege',
  [EREDIN_KING_OF_THE_WILD_HUNT]: 'Melee',
  [FRANCESCA_THE_BEAUTIFUL]: 'Ranged',
};

/** True if `playerId`'s own leader grants an automatic Horn-like doubling on `row` (mutually exclusive with a real Horn, never stacks — see rules.ts effectiveHornActive). */
export function isLeaderAutoHornRow(state: GwentState, playerId: PlayerId, row: Row): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  return AUTO_HORN_ROW_BY_ABILITY[player.leaderId] === row;
}

/** Eredin Breacc Glas The Treacherous — doubles every Spy card's power, affects BOTH players regardless of who has the leader. */
export function spyPowerMultiplier(state: GwentState): number {
  return state.players.some((p) => hasLeaderAbility(p, EREDIN_BREACC_GLAS_THE_TREACHEROUS)) ? 2 : 1;
}

/** Emhyr Invader of the North — Medic revival picks a random target instead of the player's choice, affects BOTH players. */
export function medicPicksRandomTarget(state: GwentState): boolean {
  return state.players.some((p) => hasLeaderAbility(p, EMHYR_INVADER_OF_THE_NORTH));
}

/** Francesca Hope of the Aen Seidhe — an Agile unit is auto-placed in whichever of its two rows maximizes its own power, overriding the player's chosen row. Only affects the leader's own player. */
export function agileAutoOptimizes(player: PlayerState): boolean {
  return hasLeaderAbility(player, FRANCESCA_HOPE_OF_THE_AEN_SEIDHE);
}
