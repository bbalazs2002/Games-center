import type { RamsesAction } from '../engine/actions';
import { getAdjacentCellIds } from '../engine/rules';
import { getCurrentPlayer, getCurrentSearchTarget, getHiddenTreasureIds, getSlidableCellIds } from '../engine/selectors';
import type { PlayerId, RamsesState } from '../engine/state';
import { recall, recallEasy, type RamsesAiDifficulty, type RevealMemory } from './memory';

export type { RamsesAiDifficulty } from './memory';
export { isRamsesAiDifficulty } from './memory';

/**
 * "AI gondolkodik…" pause between consecutive AI-applied slides — shared by
 * both driving paths (GameRoom.aiMoveDelayMs for online rooms,
 * useRamsesHotSeatAi.ts for local hot-seat games), same reasoning as Hotel's
 * HOTEL_AI_MOVE_DELAY_MS. See docs/ramses-0c-ai-specifikacio.md §4. Raised
 * from 500ms to 1000ms after a real playtest report (2026-07-30) that moves
 * felt too rapid-fire to follow.
 */
export const RAMSES_AI_MOVE_DELAY_MS = 1000;

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * The cell a pyramid just slid OUT of, if the CURRENT player is continuing
 * their own turn (a blank-chain, or straight after awarding a match and
 * drawing the next target) — sliding back into it would immediately undo the
 * previous step, the "oda-vissza lépkedett" (moved back and forth) real
 * playtest report (2026-07-30). Every choice function below deprioritizes
 * this cell (never forbids it outright — it stays the only legal move once
 * every other neighbor has been explored/ruled out).
 */
function justVacatedCellId(state: RamsesState): string | null {
  const lastEntry = state.log.at(-1);
  if (!lastEntry) return null;
  return lastEntry.playerId === getCurrentPlayer(state).id ? lastEntry.toCellId : null;
}

/** Drops `avoid` from `candidates` UNLESS that would leave nothing to choose from. */
function deprioritize(candidates: readonly string[], avoid: string | null): readonly string[] {
  if (avoid === null) return candidates;
  const filtered = candidates.filter((id) => id !== avoid);
  return filtered.length > 0 ? filtered : candidates;
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
 * "completely useless" even for the weakest tier. Deliberately does NOT
 * apply the justVacatedCellId anti-oscillation tie-break the other two tiers
 * get — EASY is meant to be a genuinely naive random walk, backtracking
 * included, and the already-calibrated EASY<MEDIUM<HARD ladder (see
 * docs/ramses-0c-ai-specifikacio.md §7) shouldn't shift for this tier.
 */
function chooseEasyCell(state: RamsesState, memory: RevealMemory, slidable: readonly string[]): string {
  const activeTreasureId = getCurrentSearchTarget(state);
  const recentlySeenWinning = slidable.filter((cellId) => activeTreasureId !== null && recallEasy(memory, cellId) === activeTreasureId);
  if (recentlySeenWinning.length > 0) return pickRandom(recentlySeenWinning);
  return pickRandom(slidable);
}

/** MEDIUM: avoids a cell it currently recalls as a WRONG treasure when a non-bad alternative exists; otherwise random (tie-broken away from immediately undoing the last slide). Doesn't proactively hunt for wins or known-blanks. */
function chooseMediumCell(state: RamsesState, memory: RevealMemory, slidable: readonly string[]): string {
  const activeTreasureId = getCurrentSearchTarget(state);
  const notKnownBad = slidable.filter((cellId) => {
    const known = recall(memory, cellId, 'MEDIUM');
    return known === undefined || known === null || known === activeTreasureId;
  });
  const candidates = notKnownBad.length > 0 ? notKnownBad : slidable;
  return pickRandom(deprioritize(candidates, justVacatedCellId(state)));
}

/**
 * BFS pathfinding through cells MEMORY already confirms are blank, toward a
 * cell memory confirms holds `targetTreasureId` — a genuine search algorithm
 * (real playtest report, 2026-07-30: "lehetne, hogy valamilyen kereső
 * algoritmust alkalmazzon"), not just a one-step greedy peek. Only ever
 * "sees" what the AI actually remembers (never the true board), so it's no
 * more omniscient than a human carefully tracking revealed cells — it just
 * plans several steps ahead through cells it's CONFIDENT are safe (known
 * blanks), rather than reactively re-deciding one step at a time (which is
 * exactly what produced the reported back-and-forth wandering). Returns the
 * full path (first element = the immediate move) or null if no fully-known
 * route exists yet.
 */
function findKnownPathToTarget(
  state: RamsesState,
  memory: RevealMemory,
  difficulty: RamsesAiDifficulty,
  targetTreasureId: string,
): string[] | null {
  const startId = state.emptyCellId;
  const visited = new Set<string>([startId]);
  const avoid = justVacatedCellId(state);
  if (avoid) visited.add(avoid); // never plan a route that immediately undoes the last step

  const queue: Array<{ cellId: string; path: string[] }> = [{ cellId: startId, path: [] }];
  while (queue.length > 0) {
    const { cellId, path } = queue.shift()!;
    for (const neighborId of getAdjacentCellIds(state.board, cellId)) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      const recalled = recall(memory, neighborId, difficulty);
      const nextPath = [...path, neighborId];
      if (recalled === targetTreasureId) return nextPath;
      if (recalled === null) queue.push({ cellId: neighborId, path: nextPath }); // known-blank — safe to route through
      // unknown or known-wrong: stepping there risks ending the turn early, don't plan through it
    }
  }
  return null;
}

/**
 * HARD: first tries a real plan (findKnownPathToTarget) through cells it's
 * confident are safe; only falls back to the original one-step-ahead greedy
 * choice (win > known-blank > unknown > forced known-bad) when no such route
 * is known yet — e.g. the target's location hasn't been seen at all, or
 * every route to it passes through unknown territory.
 */
function chooseHardCell(state: RamsesState, memory: RevealMemory, slidable: readonly string[]): string {
  const activeTreasureId = getCurrentSearchTarget(state);

  if (activeTreasureId !== null) {
    const path = findKnownPathToTarget(state, memory, 'HARD', activeTreasureId);
    if (path && path.length > 0) return path[0];
  }

  const avoid = justVacatedCellId(state);
  const recalled = new Map(slidable.map((cellId) => [cellId, recall(memory, cellId, 'HARD')] as const));

  const winning = slidable.filter((cellId) => activeTreasureId !== null && recalled.get(cellId) === activeTreasureId);
  if (winning.length > 0) return pickRandom(winning);

  const knownBlank = slidable.filter((cellId) => recalled.get(cellId) === null);
  if (knownBlank.length > 0) return pickRandom(deprioritize(knownBlank, avoid));

  const unknown = slidable.filter((cellId) => recalled.get(cellId) === undefined);
  if (unknown.length > 0) return pickRandom(deprioritize(unknown, avoid));

  return pickRandom(deprioritize(slidable, avoid)); // everything recalled as some other (wrong) treasure — doesn't matter which, the turn ends regardless
}

function pickTwoDistinct(items: readonly string[]): [string, string] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return [shuffled[0], shuffled[1]];
}

/**
 * Ajándék/Kockázat/Sivatagi póker each start with a naming step before any
 * slide is possible (see docs/ramses-0a-specifikacio.md §8.2/§8.4) — the AI
 * just picks uniformly at random among still-hidden treasures/other players,
 * same across all 3 difficulty tiers (unlike the slide-choice heuristics
 * above, there's no "memory" advantage to model here: naming a target is a
 * blind guess for a human player too, nothing on the visible board hints at
 * which hidden treasure is which).
 */
function chooseNamingAction(state: RamsesState): RamsesAction | null {
  const hidden = getHiddenTreasureIds(state);
  switch (state.turnPhase) {
    case 'AWAITING_GIFT_TARGET':
      return hidden.length > 0 ? { type: 'NAME_GIFT_TARGET', treasureId: pickRandom(hidden) } : null;
    case 'AWAITING_RISK_NAMING':
      return hidden.length >= 2 ? { type: 'NAME_RISK_TREASURES', treasureIds: pickTwoDistinct(hidden) } : null;
    case 'AWAITING_POKER_NAMING': {
      // Excludes forfeited players too — see rules.ts's canNamePokerChallenge,
      // which would reject naming one anyway (nobody would ever act for
      // their temporarily-borrowed turn).
      const others = state.players.filter((p) => p.id !== getCurrentPlayer(state).id && !p.forfeited);
      return hidden.length > 0 && others.length > 0
        ? { type: 'NAME_POKER_CHALLENGE', treasureId: pickRandom(hidden), targetPlayerId: pickRandom(others).id }
        : null;
    }
    default:
      return null;
  }
}

/**
 * Top-level entry point for driving an AI-controlled slot — used by both
 * RamsesRoom.computeAiMove (online rooms) and useRamsesHotSeatAi.ts (local
 * hot-seat games), so the decision logic is never duplicated between the
 * two transports (see docs/ramses-0c-ai-specifikacio.md §1). Null if `slot`
 * isn't the current player or there's nothing to slide/name (shouldn't
 * happen mid-game, defensive).
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

  const naming = chooseNamingAction(state);
  if (naming) return naming;

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
