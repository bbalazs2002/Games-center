import type { HotelAction } from '../engine/actions';
import { getCurrentPlayer } from '../engine/rules';
import type { HotelState, PlayerId } from '../engine/state';
import { rollBuildingPermit, rollD6 } from '../dice';
import { isChanceNodePhase } from './actionEnumerator';
import { chooseBestAction } from './expectimax';

export type HotelAiDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

// Own-move search depth per difficulty — see docs/hotel-0d-ai-specifikacio.md §4.4.
const DIFFICULTY_DEPTH: Record<HotelAiDifficulty, number> = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
};

/**
 * "AI gondolkodik…" pause between consecutive AI-applied actions — shared by
 * both driving paths (GameRoom.aiMoveDelayMs for online rooms,
 * useHotSeatAi.ts for local hot-seat games) so the two never drift apart
 * into two separately-tuned magic numbers. See
 * docs/hotel-0d-ai-specifikacio.md §4.7.
 */
export const HOTEL_AI_MOVE_DELAY_MS = 600;

export function isHotelAiDifficulty(value: unknown): value is HotelAiDifficulty {
  return value === 'EASY' || value === 'MEDIUM' || value === 'HARD';
}

function canActRightNow(state: HotelState, slot: PlayerId): boolean {
  if (state.turnPhase === 'AUCTION_IN_PROGRESS') return state.pendingAuction?.currentBidderId === slot;
  return getCurrentPlayer(state).id === slot;
}

/**
 * A dice/permit-die roll isn't a decision — there's exactly one legal action
 * TYPE, just an unknown value — so unlike every other phase, this needs a
 * REAL random draw (../dice.ts), not a search over candidates. The search's
 * own internal chance-node handling (actionEnumerator.ts's chanceOutcomes)
 * only ever averages over *hypothetical* outcomes while evaluating some
 * OTHER decision; it's never used to produce the actual value applied to
 * the real state, whether that state lives in a GameRoom or a hot-seat
 * LocalGameTransport.
 */
function realRollAction(state: HotelState): HotelAction {
  if (state.turnPhase === 'AWAITING_BUILDING_PERMIT') {
    return { type: 'ROLL_BUILDING_PERMIT', value: rollBuildingPermit() };
  }
  const type = state.turnPhase === 'AWAITING_ROLL' ? 'ROLL_MOVE_DICE' : 'ROLL_NIGHTS';
  return { type, value: rollD6() } as HotelAction;
}

/**
 * Top-level entry point for driving an AI-controlled slot — used by both
 * HotelRoom.computeAiMove (online rooms) and useHotSeatAi.ts (local hot-seat
 * games), so the decision logic itself is never duplicated between the two
 * transports. Null if `slot` has nothing to legally do right now (not the
 * current turn-holder, and not the player whose turn it is to bid), otherwise the
 * action for the configured difficulty: a real dice/permit roll when that's
 * the only legal move, or the expectimax-chosen action otherwise (see
 * expectimax.ts).
 */
export function chooseHotelAiAction(state: HotelState, slot: PlayerId, difficulty: HotelAiDifficulty): HotelAction | null {
  if (!canActRightNow(state, slot)) return null;
  if (isChanceNodePhase(state)) return realRollAction(state);
  return chooseBestAction(state, slot, DIFFICULTY_DEPTH[difficulty]);
}
