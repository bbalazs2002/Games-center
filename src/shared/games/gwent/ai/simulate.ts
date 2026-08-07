import { createInitialState } from '../engine/initialState';
import { reducer } from '../engine/reducer';
import { computeSideTotal } from '../engine/rules';
import type { GwentState, PlayerId } from '../engine/state';
import { buildTacticalAiDeckConfig } from './deckBuilder';
import { chooseGwentAiAction, type GwentAiDifficulty } from './strategy';

const DEFAULT_MAX_STEPS = 4000;

export interface SimulationPlayerConfig {
  name: string;
  difficulty: GwentAiDifficulty;
}

export interface SimulationPlayerResult {
  id: PlayerId;
  name: string;
  difficulty: GwentAiDifficulty;
  finalSideScore: number;
  livesLeft: number;
  roundsWon: number;
  isWinner: boolean;
}

export interface SimulationResult {
  players: SimulationPlayerResult[];
  winnerIds: PlayerId[];
  steps: number;
  /** True if the game didn't reach FINISHED within maxSteps — should be very rare (a Gwent match is naturally bounded by deck size + 2 lives). */
  reachedStepCap: boolean;
}

/**
 * MULLIGAN/AWAITING_START_CHOICE/ROUND_RESOLVED aren't turn-gated the same
 * way ROUND_IN_PROGRESS is — see strategy.ts's chooseGwentAiAction doc
 * comment for why the AI itself never fires FLIP_STARTING_COIN/
 * CONTINUE_AFTER_ROUND (a real game always has a human to do that). An
 * AI-only simulation has no human, so THIS driver fires them directly
 * instead, deliberately outside chooseGwentAiAction.
 */
function driveOneStep(state: GwentState, difficultyOf: (id: PlayerId) => GwentAiDifficulty): GwentState {
  if (state.phase === 'MULLIGAN' || state.phase === 'AWAITING_START_CHOICE') {
    for (const player of state.players) {
      const action = chooseGwentAiAction(state, player.id, difficultyOf(player.id));
      if (action) return reducer(state, action);
    }
    // Nobody has an own-decision action pending — AWAITING_START_CHOICE with
    // no decisive Scoia'tael player (or MULLIGAN, unreachable — both players
    // always eventually confirm) falls back to the coin flip.
    return reducer(state, { type: 'FLIP_STARTING_COIN' });
  }

  if (state.phase === 'ROUND_RESOLVED') {
    return reducer(state, { type: 'CONTINUE_AFTER_ROUND' });
  }

  if (state.phase === 'ROUND_IN_PROGRESS') {
    const actorId = state.players[state.currentPlayerIndex].id;
    const action = chooseGwentAiAction(state, actorId, difficultyOf(actorId));
    // PASS is always a legal candidate for the current (not-yet-passed) player — shouldn't happen, defensive only.
    if (!action) return { ...state, phase: 'FINISHED', winnerIds: [] };
    return reducer(state, action);
  }

  return state; // FINISHED — the caller's loop stops before calling this again
}

/**
 * Runs one full Gwent game with only AI players — a standalone module (no
 * lobby UI, no GameRoom/Colyseus, no database), for exercising the full
 * mulligan → round → round → match lifecycle across random faction/leader/
 * difficulty combinations. Mirrors Hotel/Ramses's simulate.ts role.
 */
export function simulateGwentGame(playerConfigs: [SimulationPlayerConfig, SimulationPlayerConfig], maxSteps = DEFAULT_MAX_STEPS): SimulationResult {
  const [configA, configB] = playerConfigs;
  let state = createInitialState([buildTacticalAiDeckConfig(configA.name), buildTacticalAiDeckConfig(configB.name)]);
  const difficultyById = new Map<PlayerId, GwentAiDifficulty>(state.players.map((player, i) => [player.id, playerConfigs[i].difficulty]));
  const difficultyOf = (id: PlayerId): GwentAiDifficulty => difficultyById.get(id) ?? 'MEDIUM';

  let steps = 0;
  while (state.phase !== 'FINISHED' && steps < maxSteps) {
    state = driveOneStep(state, difficultyOf);
    steps += 1;
  }

  const players: SimulationPlayerResult[] = state.players.map((player, i) => ({
    id: player.id,
    name: player.name,
    difficulty: playerConfigs[i].difficulty,
    finalSideScore: computeSideTotal(state, player.id),
    livesLeft: player.lives,
    roundsWon: player.roundsWon,
    isWinner: state.winnerIds.includes(player.id),
  }));

  return { players, winnerIds: state.winnerIds, steps, reachedStepCap: state.phase !== 'FINISHED' };
}
