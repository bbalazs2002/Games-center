import type { RamsesState } from '../engine/state';

export type RamsesAiDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export function isRamsesAiDifficulty(value: unknown): value is RamsesAiDifficulty {
  return value === 'EASY' || value === 'MEDIUM' || value === 'HARD';
}

/**
 * cellId -> the last treasureId observed there (null = observed blank).
 * Missing key = never observed. A SINGLE instance for the whole game, not
 * per-AI-slot — every participant (human or AI) watches the same shared
 * board, so there is exactly one "what has been seen so far" (see
 * docs/ramses-0c-ai-specifikacio.md §3.1).
 */
export type RevealMemory = Map<string, string | null>;

export function createRevealMemory(): RevealMemory {
  return new Map();
}

/**
 * Records whatever is currently visible at the empty cell — call this on
 * EVERY observed state change (human or AI move alike, including the
 * initial state), never only on the AI's own turns. `state` MUST already be
 * the masked/public view (see docs/ramses-0c-ai-specifikacio.md §3.2) —
 * this function trusts its input and does not mask itself.
 */
export function observeRevealedState(memory: RevealMemory, state: RamsesState): void {
  const emptyCell = state.board.find((cell) => cell.id === state.emptyCellId);
  if (emptyCell) memory.set(emptyCell.id, emptyCell.treasureId);
}

/**
 * Simulated forgetting (see docs/ramses-0c-ai-specifikacio.md §3.3.1): the
 * memory's CONTENTS never change here — this only decides whether the AI
 * "recalls" a given cell right now. A forgotten cell behaves exactly like
 * an unobserved one for this one decision; the same cell may be recalled
 * successfully again later (or even earlier in the very same decision, if
 * queried twice), since the underlying Map is untouched.
 *
 * Initial, untuned proposal — exact tuning is playtesting work, not
 * Claude's task (same precedent as docs/hotel-0d-ai-specifikacio.md §1).
 */
const FORGET_CHANCE: Record<RamsesAiDifficulty, number> = {
  EASY: 0, // irrelevant — EASY never consults memory at all
  MEDIUM: 0.35,
  HARD: 0.08,
};

export function recall(memory: RevealMemory, cellId: string, difficulty: RamsesAiDifficulty): string | null | undefined {
  if (Math.random() < FORGET_CHANCE[difficulty]) return undefined;
  return memory.get(cellId);
}
