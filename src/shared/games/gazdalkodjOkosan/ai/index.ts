import type { GazdalkodjOkosanAction } from '../engine/actions';
import { getCurrentPlayer } from '../engine/rules';
import type { GazdalkodjOkosanState, PlayerId } from '../engine/state';
import { rollD6 } from '../dice';
import { isChanceNodePhase } from './actionEnumerator';
import { chooseBestAction } from './expectimax';

export type GazdalkodjOkosanAiDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

// Own-move search depth per difficulty — see docs/gazdalkodj-okosan-0d-ai-specifikacio.md §3.1 (Hotel's identical convention).
const DIFFICULTY_DEPTH: Record<GazdalkodjOkosanAiDifficulty, number> = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
};

/**
 * "AI gondolkodik…" pause between consecutive AI-applied actions — shared by
 * both driving paths (GameRoom.aiMoveDelayMs for online rooms,
 * useGazdalkodjOkosanHotSeatAi.ts for local hot-seat games), same reasoning
 * as Hotel's HOTEL_AI_MOVE_DELAY_MS.
 */
export const GAZDALKODJ_OKOSAN_AI_MOVE_DELAY_MS = 600;

export function isGazdalkodjOkosanAiDifficulty(value: unknown): value is GazdalkodjOkosanAiDifficulty {
  return value === 'EASY' || value === 'MEDIUM' || value === 'HARD';
}

/**
 * A dice roll isn't a decision — there's exactly one legal action TYPE, just
 * an unknown value — so unlike every other phase, this needs a REAL random
 * draw (../dice.ts), not a search over candidates. The search's own internal
 * chance-node handling (actionEnumerator.ts's chanceOutcomes) only ever
 * averages over HYPOTHETICAL outcomes while evaluating some OTHER decision;
 * it's never used to produce the actual value applied to the real state.
 * Online, GazdalkodjOkosanRoom.resolveServerAction discards/regenerates this
 * value anyway; hot-seat has no server, so this IS the authoritative roll.
 */
function realRollAction(): GazdalkodjOkosanAction {
  return { type: 'ROLL_MOVE_DICE', value: rollD6() };
}

/**
 * Top-level entry point for driving an AI-controlled slot — used by both
 * GazdalkodjOkosanRoom.computeAiMove (online rooms) and
 * useGazdalkodjOkosanHotSeatAi.ts (local hot-seat games), so the decision
 * logic itself is never duplicated between the two transports. Null if
 * `slot` isn't the current turn-holder (no out-of-turn actor exists in this
 * engine, unlike Hotel's auction) or the game already finished, otherwise
 * the action for the configured difficulty: a real dice roll when that's the
 * only legal move, or the expectimax-chosen action otherwise.
 */
export function chooseGazdalkodjOkosanAiAction(
  state: GazdalkodjOkosanState,
  slot: PlayerId,
  difficulty: GazdalkodjOkosanAiDifficulty,
): GazdalkodjOkosanAction | null {
  if (state.status !== 'IN_PROGRESS' || getCurrentPlayer(state).id !== slot) return null;
  if (isChanceNodePhase(state)) return realRollAction();
  return chooseBestAction(state, slot, DIFFICULTY_DEPTH[difficulty]);
}
