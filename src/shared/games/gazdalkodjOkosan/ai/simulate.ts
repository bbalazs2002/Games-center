import { createInitialState } from '../engine/initialState';
import { reducer } from '../engine/reducer';
import { getCurrentPlayer, totalWealth } from '../engine/rules';
import type { GazdalkodjOkosanState, PlayerId } from '../engine/state';
import { chooseGazdalkodjOkosanAiAction, type GazdalkodjOkosanAiDifficulty } from './index';

const DEFAULT_MAX_STEPS = 4000;

export interface SimulationPlayerConfig {
  name: string;
  difficulty: GazdalkodjOkosanAiDifficulty;
}

export interface SimulationPlayerResult {
  id: PlayerId;
  name: string;
  difficulty: GazdalkodjOkosanAiDifficulty;
  bankrupt: boolean;
  finalTotalWealth: number;
}

export interface SimulationResult {
  players: SimulationPlayerResult[];
  winnerId: PlayerId | null;
  steps: number;
  /** True if the game didn't reach FINISHED within maxSteps — a real possibility with cautious AI on all sides, not necessarily a bug. */
  reachedStepCap: boolean;
}

/**
 * One step forward: the current turn-holder (no out-of-turn actor exists in
 * this engine, unlike Hotel's auction) takes their AI-chosen action. Mirrors
 * GameRoom's tryApplyOneAiMove/maybeTriggerAiMove, but pure, synchronous,
 * and — same as Hotel's simulate.ts — with NO artificial "AI gondolkodik"
 * delay: that pacing (aiMoveDelayMs) is a GameRoom/hot-seat-hook-only
 * concept for making a LIVE game watchable, it doesn't exist on this path.
 */
function driveOneStep(state: GazdalkodjOkosanState, difficultyOf: (id: PlayerId) => GazdalkodjOkosanAiDifficulty): GazdalkodjOkosanState {
  const actorId = getCurrentPlayer(state).id;
  const action = chooseGazdalkodjOkosanAiAction(state, actorId, difficultyOf(actorId));
  // Shouldn't happen structurally (every reachable phase has at least one
  // legal action for the current player) — but a simulation runner must
  // never hang, so treat "nothing to do" as "this game is over" rather than loop.
  if (!action) return { ...state, status: 'FINISHED' };
  return reducer(state, action);
}

/**
 * Runs one full Gazdálkodj okosan game with only AI players — a standalone
 * module (no lobby UI, no GameRoom/Colyseus, no database) for playing out
 * many matchups quickly to compare difficulty levels and gather data toward
 * tuning the heuristic's weights (see docs/gazdalkodj-okosan-0d-ai-specifikacio.md
 * §3.3/§6 — the tuning itself is explicitly out of scope, this is just the
 * tool). Runs to completion, or up to `maxSteps` (default 4000) as a safety
 * net against a game that never naturally ends.
 */
export function simulateGazdalkodjOkosanGame(playerConfigs: SimulationPlayerConfig[], maxSteps = DEFAULT_MAX_STEPS): SimulationResult {
  let state = createInitialState(playerConfigs.map((config) => config.name));
  const difficultyById = new Map<PlayerId, GazdalkodjOkosanAiDifficulty>(
    state.players.map((player, i) => [player.id, playerConfigs[i].difficulty]),
  );
  const difficultyOf = (id: PlayerId): GazdalkodjOkosanAiDifficulty => difficultyById.get(id) ?? 'MEDIUM';

  let steps = 0;
  while (state.status !== 'FINISHED' && steps < maxSteps) {
    state = driveOneStep(state, difficultyOf);
    steps += 1;
  }

  const players: SimulationPlayerResult[] = state.players.map((player, i) => ({
    id: player.id,
    name: player.name,
    difficulty: playerConfigs[i].difficulty,
    bankrupt: player.bankrupt,
    finalTotalWealth: totalWealth(player),
  }));

  return {
    players,
    winnerId: state.winnerId,
    steps,
    reachedStepCap: state.status !== 'FINISHED',
  };
}
