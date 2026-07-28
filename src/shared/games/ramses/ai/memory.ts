import type { RamsesState } from '../engine/state';

export type RamsesAiDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export function isRamsesAiDifficulty(value: unknown): value is RamsesAiDifficulty {
  return value === 'EASY' || value === 'MEDIUM' || value === 'HARD';
}

/**
 * How many of the most recently observed reveals EASY's short-term memory
 * holds onto (see recallEasy) — deliberately tiny, nowhere near MEDIUM/HARD's
 * full recall, just enough that EASY isn't a total shutout machine. Added
 * 2026-07-27 after AI-only simulation data showed EASY found ZERO treasures
 * in 57% of games (see docs/ramses-0c-ai-specifikacio.md §7.1/§3.3.2) — an
 * untuned initial proposal, same disclaimer as FORGET_CHANCE below.
 */
const EASY_RECENT_WINDOW = 3;

/**
 * `full`: cellId -> the last treasureId observed there (null = observed
 * blank), missing key = never observed — what MEDIUM/HARD's `recall()`
 * reads. `recentKeys`: the last `EASY_RECENT_WINDOW` cellIds observed, most
 * recent last — a bounded "what did I just see" window, what EASY's
 * `recallEasy()` reads instead. A SINGLE instance for the whole game, not
 * per-AI-slot — every participant (human or AI) watches the same shared
 * board, so there is exactly one "what has been seen so far" (see
 * docs/ramses-0c-ai-specifikacio.md §3.1).
 */
export interface RevealMemory {
  full: Map<string, string | null>;
  recentKeys: string[];
}

export function createRevealMemory(): RevealMemory {
  return { full: new Map(), recentKeys: [] };
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
  if (!emptyCell) return;
  memory.full.set(emptyCell.id, emptyCell.treasureId);
  memory.recentKeys = memory.recentKeys.filter((id) => id !== emptyCell.id); // re-observing a cell refreshes its recency, doesn't duplicate it
  memory.recentKeys.push(emptyCell.id);
  if (memory.recentKeys.length > EASY_RECENT_WINDOW) memory.recentKeys.shift();
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
  EASY: 0, // unused — EASY consults recallEasy(), never recall()
  MEDIUM: 0.35,
  HARD: 0.08,
};

/** Used by MEDIUM/HARD — the full-game memory, with simulated forgetting. */
export function recall(memory: RevealMemory, cellId: string, difficulty: RamsesAiDifficulty): string | null | undefined {
  if (Math.random() < FORGET_CHANCE[difficulty]) return undefined;
  return memory.full.get(cellId);
}

/**
 * Used by EASY only — a tiny, bounded "what did I just see" window (see
 * EASY_RECENT_WINDOW), deliberately far weaker than MEDIUM/HARD's full
 * recall(). No forget-chance roll on top: the boundedness itself IS the
 * forgetting mechanism here. Returns undefined for anything outside the
 * recent window, exactly like an unobserved cell.
 */
export function recallEasy(memory: RevealMemory, cellId: string): string | null | undefined {
  if (!memory.recentKeys.includes(cellId)) return undefined;
  return memory.full.get(cellId);
}
