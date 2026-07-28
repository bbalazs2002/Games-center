import type { RamsesAction } from '../engine/actions';
import { getCurrentPlayer, getSlidableCellIds } from '../engine/selectors';
import type { PlayerId, RamsesState } from '../engine/state';
import { recall, recallEasy, type RamsesAiDifficulty, type RevealMemory } from './memory';

export type { RamsesAiDifficulty } from './memory';
export { isRamsesAiDifficulty } from './memory';

/**
 * "AI gondolkodik…" pause between consecutive AI-applied slides — shared by
 * both driving paths (GameRoom.aiMoveDelayMs for online rooms,
 * useRamsesHotSeatAi.ts for local hot-seat games), same reasoning as Hotel's
 * HOTEL_AI_MOVE_DELAY_MS. See docs/ramses-0c-ai-specifikacio.md §4.
 */
export const RAMSES_AI_MOVE_DELAY_MS = 500;

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * EASY: overwhelmingly random (mirrors Dáma's v1 AI) — but not literally
 * amnesiac. A small "did I just see that?" recognition of the last few
 * reveals (see recallEasy/EASY_RECENT_WINDOW in memory.ts): if a slidable
 * cell happens to be one EASY can still recall from its short-term window
 * AND it's the current target, it takes the obvious win. It never avoids
 * known-bad cells and never seeks known-blanks — added 2026-07-27 after
 * AI-only simulation showed EASY found zero treasures in 57% of games (see
 * docs/ramses-0c-ai-specifikacio.md §7.1/§3.3.2), which felt too close to
 * "completely useless" even for the weakest tier.
 */
function chooseEasyCell(state: RamsesState, memory: RevealMemory, slidable: readonly string[]): string {
  const activeTreasureId = state.activeCard?.treasureId ?? null;
  const recentlySeenWinning = slidable.filter((cellId) => activeTreasureId !== null && recallEasy(memory, cellId) === activeTreasureId);
  if (recentlySeenWinning.length > 0) return pickRandom(recentlySeenWinning);
  return pickRandom(slidable);
}

/** MEDIUM: avoids a cell it currently recalls as a WRONG treasure when a non-bad alternative exists; otherwise random. Doesn't proactively hunt for wins or known-blanks. */
function chooseMediumCell(state: RamsesState, memory: RevealMemory, slidable: readonly string[]): string {
  const activeTreasureId = state.activeCard?.treasureId ?? null;
  const notKnownBad = slidable.filter((cellId) => {
    const known = recall(memory, cellId, 'MEDIUM');
    return known === undefined || known === null || known === activeTreasureId;
  });
  return pickRandom(notKnownBad.length > 0 ? notKnownBad : slidable);
}

/** HARD: full greedy — win > known-blank > unknown > forced known-bad. */
function chooseHardCell(state: RamsesState, memory: RevealMemory, slidable: readonly string[]): string {
  const activeTreasureId = state.activeCard?.treasureId ?? null;
  const recalled = new Map(slidable.map((cellId) => [cellId, recall(memory, cellId, 'HARD')] as const));

  const winning = slidable.filter((cellId) => activeTreasureId !== null && recalled.get(cellId) === activeTreasureId);
  if (winning.length > 0) return pickRandom(winning);

  const knownBlank = slidable.filter((cellId) => recalled.get(cellId) === null);
  if (knownBlank.length > 0) return pickRandom(knownBlank);

  const unknown = slidable.filter((cellId) => recalled.get(cellId) === undefined);
  if (unknown.length > 0) return pickRandom(unknown);

  return pickRandom(slidable); // everything recalled as some other (wrong) treasure — doesn't matter which, the turn ends regardless
}

/**
 * Top-level entry point for driving an AI-controlled slot — used by both
 * RamsesRoom.computeAiMove (online rooms) and useRamsesHotSeatAi.ts (local
 * hot-seat games), so the decision logic is never duplicated between the
 * two transports (see docs/ramses-0c-ai-specifikacio.md §1). Null if `slot`
 * isn't the current player or there's nothing to slide (shouldn't happen
 * mid-game, defensive).
 *
 * `state` MUST already be the masked/public view — see
 * docs/ramses-0c-ai-specifikacio.md §3.2 (RamsesRoom.getPublicGameState /
 * MaskedRamsesTransport). This function does not mask; it trusts its input.
 */
export function chooseRamsesAiAction(
  state: RamsesState,
  memory: RevealMemory,
  slot: PlayerId,
  difficulty: RamsesAiDifficulty,
): RamsesAction | null {
  if (getCurrentPlayer(state).id !== slot) return null;
  const slidable = getSlidableCellIds(state);
  if (slidable.length === 0) return null;

  const fromCellId =
    difficulty === 'EASY'
      ? chooseEasyCell(state, memory, slidable)
      : difficulty === 'MEDIUM'
        ? chooseMediumCell(state, memory, slidable)
        : chooseHardCell(state, memory, slidable);

  return { type: 'SLIDE_PYRAMID', fromCellId };
}
