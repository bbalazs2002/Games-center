import type { Faction, Row } from './types';

export type PlayerId = string;

/**
 * A concrete physical card IN A GIVEN MATCH — `defId` alone isn't a unique
 * identifier because a `CardDef` can have `copies > 1` in the same deck.
 * `chosenRow` is only meaningful for Agile units (the row picked at play
 * time) — see docs/gwent-0a-specifikacio.md §3.2.
 */
export interface CardInstance {
  instanceId: string;
  defId: string;
  chosenRow: Row | null;
}

export interface BoardRowState {
  cards: CardInstance[];
  /** A Horn card was played into this row this round — see rules.ts effectiveHornActive (some leader passives grant the same doubling without a real Horn). */
  hornActive: boolean;
  /** Dandelion is on this row — persistent doubling of every OTHER card in the row, cleared once Dandelion leaves (Decoy/Scorch/RowScorch) — see docs/gwent-0a-specifikacio.md §4.4. */
  dandelionActive: boolean;
}

export function createEmptyBoard(): Record<Row, BoardRowState> {
  return {
    Melee: { cards: [], hornActive: false, dandelionActive: false },
    Ranged: { cards: [], hornActive: false, dandelionActive: false },
    Siege: { cards: [], hornActive: false, dandelionActive: false },
  };
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  faction: Faction;
  leaderId: string;
  leaderAbilityUsed: boolean;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  board: Record<Row, BoardRowState>;
  lives: number;
  roundsWon: number;
  /** Passed for the REST of this round — resets to false at the start of every round. */
  passed: boolean;
  mulligansLeft: number;
  /**
   * Cards swapped out during this player's own mulligan, held here (NOT back
   * in `deck`, NOT in `discard`) until `CONFIRM_MULLIGAN` — so a player can
   * never immediately redraw a card they just swapped away mid-mulligan
   * (2026-08-04 clarification, see docs/gwent-0a-specifikacio.md §"Gwent-0a.2").
   * Always empty outside the MULLIGAN phase.
   */
  mulliganSetAside: CardInstance[];
  mulliganConfirmed: boolean;
}

export type GwentPhase =
  | 'MULLIGAN'
  /**
   * Between mulligan and the round's first play — who starts is either a
   * coin flip (`FLIP_STARTING_COIN`) or, if exactly one player's faction is
   * Scoia'tael, that player's explicit choice (`CHOOSE_STARTING_PLAYER`).
   * Re-entered at the start of EVERY round, not just round 1 — the
   * Scoia'tael bonus applies every round (docs/gwent-0a-specifikacio.md §2).
   */
  | 'AWAITING_START_CHOICE'
  | 'ROUND_IN_PROGRESS'
  /** Both players passed — round outcome already computed and logged, waiting on `CONTINUE_AFTER_ROUND` so the summary is never skipped silently. */
  | 'ROUND_RESOLVED'
  | 'FINISHED';

/**
 * One structured record per notable event, same principle as Hotel's
 * `LogEntry` (docs/hotel-0a-specifikacio.md §9.2): the engine stays
 * language/UI-agnostic, a client-side formatter renders Hungarian text, and
 * a future animation layer can replay these without the engine knowing
 * anything about rendering (docs/gwent-0a-specifikacio.md §6).
 */
export type GwentLogEntry =
  | { type: 'MULLIGAN_SWAPPED'; playerId: PlayerId }
  | { type: 'MULLIGAN_CONFIRMED'; playerId: PlayerId }
  | { type: 'STARTING_COIN_FLIP'; result: 'castle' | 'torch'; startingPlayerId: PlayerId }
  | { type: 'STARTING_PLAYER_CHOSEN'; chooserId: PlayerId; startingPlayerId: PlayerId }
  | { type: 'CARD_PLAYED'; playerId: PlayerId; instanceId: string; defId: string; row: Row; ownerRowPlayerId: PlayerId }
  | { type: 'CARD_MOVED_TO_OPPONENT'; playerId: PlayerId; instanceId: string; defId: string; row: Row }
  | { type: 'CARDS_DRAWN'; playerId: PlayerId; count: number; reason: 'SPY' | 'ROUND_WON_BONUS' | 'MULLIGAN' }
  | { type: 'MUSTER_TRIGGERED'; playerId: PlayerId; triggerInstanceId: string; playedInstanceIds: string[] }
  /** No `row` field (Gwent-0c.4 §11) — placement now goes through resolvePlayEffects, which appends its own CARD_PLAYED/CARD_MOVED_TO_OPPONENT entry with the authoritative row+side right after this one. */
  | { type: 'MEDIC_REVIVED'; playerId: PlayerId; instanceId: string; defId: string; wasRandom: boolean }
  | { type: 'DECOY_SWAPPED'; playerId: PlayerId; decoyInstanceId: string; returnedInstanceId: string; returnedDefId: string }
  | { type: 'WEATHER_APPLIED'; playerId: PlayerId; instanceId: string; row: Row }
  | { type: 'WEATHER_CLEARED'; playerId: PlayerId; instanceId: string }
  | { type: 'SCORCH_RESOLVED'; playerId: PlayerId; instanceId: string; destroyedInstanceIds: string[] }
  | { type: 'ROW_SCORCH_RESOLVED'; playerId: PlayerId; row: Row; destroyedInstanceIds: string[] }
  | { type: 'COW_REPLACED'; playerId: PlayerId; row: Row; newInstanceId: string }
  | { type: 'LEADER_ABILITY_ACTIVATED'; playerId: PlayerId; abilityId: string }
  | { type: 'LEADER_REVEALED_OPPONENT_HAND'; playerId: PlayerId; revealedDefIds: string[] }
  | { type: 'LEADER_ABILITY_CANCELED'; playerId: PlayerId; canceledPlayerId: PlayerId }
  | { type: 'CARD_RESTORED_FROM_DISCARD'; playerId: PlayerId; instanceId: string; defId: string; fromOpponentDiscard: boolean }
  | { type: 'PASSED'; playerId: PlayerId }
  | {
      type: 'ROUND_RESOLVED';
      round: number;
      totals: Record<PlayerId, number>;
      winnerId: PlayerId | null;
      tie: boolean;
      livesLost: PlayerId[];
    }
  | { type: 'GAME_WON'; winnerId: PlayerId };

export interface GwentState {
  players: [PlayerState, PlayerState];
  currentPlayerIndex: number;
  round: number;
  activeWeatherRows: Row[];
  phase: GwentPhase;
  winnerIds: PlayerId[];
  /** Append-only event history — see GwentLogEntry. */
  log: GwentLogEntry[];
}
