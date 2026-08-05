import type { Row } from './types';
import type { PlayerId } from './state';

/**
 * Discriminated union of every player-initiated action — same convention as
 * Hotel's `HotelAction` (src/shared/games/hotel/engine/actions.ts): randomness
 * the UI needs to *animate* is generated inside the reducer (matching the
 * Ramses convention, not Hotel's dice-carried-in-payload one — see
 * docs/gwent-0a-specifikacio.md §"Gwent-0a.2" for why), so `FLIP_STARTING_COIN`
 * carries no payload, the client reads the *result* off the appended log entry.
 */
export type GwentAction =
  | { type: 'MULLIGAN_SWAP'; playerId: PlayerId; instanceId: string }
  | { type: 'CONFIRM_MULLIGAN'; playerId: PlayerId }
  /** Only legal when neither player's faction is Scoia'tael — see rules.ts canFlipStartingCoin. */
  | { type: 'FLIP_STARTING_COIN' }
  /** Only legal for the ONE player whose faction is Scoia'tael this round — see rules.ts canChooseStartingPlayer. */
  | { type: 'CHOOSE_STARTING_PLAYER'; playerId: PlayerId; chosenPlayerId: PlayerId }
  /**
   * `chosenRow` is dual-purpose: for an Agile UNIT it's which of its two
   * legal rows to place it in; for a Horn card it's which row to boost.
   * Never used together with `decoyTargetInstanceId`/`medicReviveInstanceIds`
   * (a card is at most one of Agile/Horn/Decoy/Medic-triggering at a time).
   */
  | {
      type: 'PLAY_CARD';
      playerId: PlayerId;
      instanceId: string;
      chosenRow?: Row;
      /** Required iff the played card's kind is 'Decoy' — an instanceId currently on the player's OWN board. */
      decoyTargetInstanceId?: string;
      /**
       * Optional iff the played card has the Medic ability — an ORDERED
       * chain of instanceIds in the player's OWN discard pile to revive.
       * Element 0 is this card's own revival target; if THAT card is also
       * Medic, element 1 is its own revival target, and so on (Gwent-0c.4
       * §11 — a revived Medic-ability card gets a real pick too, not a
       * silent decline). Omitted/empty = decline. Ignored (random pick
       * instead, chain collapses to depth 1) if the Invader of the North
       * leader passive is active on either side.
       */
      medicReviveInstanceIds?: string[];
    }
  | { type: 'PASS'; playerId: PlayerId }
  /**
   * Generic envelope for the 13 one-shot leader abilities (category A, see
   * leaderConstants.ts) — each handler in leaderAbilities.ts interprets
   * whichever of these fields it needs; the rest are ignored. Consumes the
   * player's turn, exactly like PLAY_CARD/PASS (2026-08-04 clarification).
   */
  | { type: 'ACTIVATE_LEADER_ABILITY'; playerId: PlayerId; targetInstanceId?: string; secondaryInstanceIds?: string[] }
  /** Acknowledges the ROUND_RESOLVED summary and advances to the next round or FINISHED — never automatic, see state.ts GwentPhase. */
  | { type: 'CONTINUE_AFTER_ROUND' };
