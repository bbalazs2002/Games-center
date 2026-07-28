import { createInitialState } from '../engine/initialState';
import { reducer } from '../engine/reducer';
import { scoreOf, toPublicRamsesState } from '../engine/rules';
import type { PlayerId, RamsesState } from '../engine/state';
import { chooseRamsesAiAction, createRevealMemory, observeRevealedState, type RamsesAiDifficulty, type RevealMemory } from '.';

// Calibrated empirically (see docs/ramses-0c-ai-specifikacio.md §7) — a
// mixed-difficulty game with an EASY (memory-blind) slot can genuinely need
// ~15,000-20,000 slides to exhaust the 30-card deck, an unbounded-tail
// random-walk process with no guaranteed finite bound. Kept generous rather
// than cutting games short and falling back to a "leader" comparison (as
// Hotel's simulator does), since — unlike Hotel — every Ramses AI decision
// is essentially instant (no expectimax search), so waiting for a REAL,
// unambiguous winner across many repeats is cheap enough to just do.
const DEFAULT_MAX_STEPS = 60000;

export interface SimulationPlayerConfig {
  name: string;
  difficulty: RamsesAiDifficulty;
}

export interface SimulationPlayerResult {
  id: PlayerId;
  name: string;
  difficulty: RamsesAiDifficulty;
  score: number;
  cardsWon: number;
  isWinner: boolean;
}

export interface SimulationResult {
  players: SimulationPlayerResult[];
  winnerIds: PlayerId[];
  steps: number;
  /** True if the game didn't reach FINISHED within maxSteps — should be rare given the generous default budget, but a real possibility for very EASY-heavy lineups. */
  reachedStepCap: boolean;
}

/**
 * One step forward: the current player's AI-chosen action, applied through
 * the real reducer — mirrors RamsesRoom.computeAiMove/useRamsesHotSeatAi,
 * but pure, synchronous, and with no artificial "AI gondolkodik" delay (that
 * pacing is a GameRoom/hot-seat-hook-only concept for making a live game
 * watchable — irrelevant here, same reasoning as Hotel's simulate.ts).
 * `memory` is updated after every step, exactly mirroring the real
 * integration points (see docs/ramses-0c-ai-specifikacio.md §3.4) — a
 * simulation that skipped this would be testing a different, easier AI than
 * the one actually shipped.
 */
function driveOneStep(state: RamsesState, memory: RevealMemory, difficultyOf: (id: PlayerId) => RamsesAiDifficulty): RamsesState {
  const actorId = state.players[state.currentPlayerIndex].id;
  const publicState = toPublicRamsesState(state);
  const action = chooseRamsesAiAction(publicState, memory, actorId, difficultyOf(actorId));
  // Shouldn't happen structurally (there's always a slidable cell while
  // IN_PROGRESS) — but a simulation runner must never hang.
  if (!action) return { ...state, status: 'FINISHED' };
  const next = reducer(state, action);
  observeRevealedState(memory, toPublicRamsesState(next));
  return next;
}

/**
 * Runs one full Ramses game with only AI players — a standalone module (no
 * lobby UI, no GameRoom/Colyseus, no database) for playing out many
 * matchups quickly to compare difficulty levels and gather data toward
 * tuning the strategy's forget-chance weights (see
 * docs/ramses-0c-ai-specifikacio.md §3.3.1/§7). Runs to completion, or up to
 * `maxSteps` (default 60,000) as a safety net against a game that never
 * naturally ends.
 */
export function simulateRamsesGame(playerConfigs: SimulationPlayerConfig[], maxSteps = DEFAULT_MAX_STEPS): SimulationResult {
  let state = createInitialState(playerConfigs.map((config) => config.name));
  const difficultyById = new Map<PlayerId, RamsesAiDifficulty>(
    state.players.map((player, i) => [player.id, playerConfigs[i].difficulty]),
  );
  const difficultyOf = (id: PlayerId): RamsesAiDifficulty => difficultyById.get(id) ?? 'MEDIUM';

  const memory = createRevealMemory();
  observeRevealedState(memory, toPublicRamsesState(state)); // eager: the initial state is an observation too

  let steps = 0;
  while (state.status !== 'FINISHED' && steps < maxSteps) {
    state = driveOneStep(state, memory, difficultyOf);
    steps += 1;
  }

  const players: SimulationPlayerResult[] = state.players.map((player, i) => ({
    id: player.id,
    name: player.name,
    difficulty: playerConfigs[i].difficulty,
    score: scoreOf(player),
    cardsWon: player.wonCards.length,
    isWinner: state.winnerIds.includes(player.id),
  }));

  return {
    players,
    winnerIds: state.winnerIds,
    steps,
    reachedStepCap: state.status !== 'FINISHED',
  };
}
