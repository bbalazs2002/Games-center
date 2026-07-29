import { createInitialState } from '../engine/initialState';
import { reducer } from '../engine/reducer';
import type { DamaState, Player } from '../engine/state';
import { chooseDamaAiAction, type DamaAiDifficulty } from './index';

const DEFAULT_MAX_STEPS = 4000;

export interface SimulationConfig {
  LIGHT: DamaAiDifficulty;
  DARK: DamaAiDifficulty;
}

export interface SimulationResult {
  config: SimulationConfig;
  /** null if the game ended in an (engine-supported but never actually produced by AI-only play) DRAW, or if it never concluded within maxSteps. */
  winner: Player | null;
  steps: number;
  /** True if the game didn't reach a decisive status within maxSteps — see the module doc comment: this engine has no repetition/no-progress draw rule, so a weak (EASY) endgame can in principle run very long. */
  reachedStepCap: boolean;
  finalPieceCount: Record<Player, number>;
}

function countPieces(state: DamaState, player: Player): number {
  let count = 0;
  state.board.forEach((row) => row.forEach((piece) => {
    if (piece?.player === player) count += 1;
  }));
  return count;
}

/**
 * One step forward: the current player's AI-chosen move, applied through the
 * real reducer — mirrors GameRoom's tryApplyOneAiMove, but pure, synchronous,
 * and with NO artificial "AI gondolkodik" delay (that pacing is a
 * GameRoom/hot-seat-hook-only concept, see docs/dama-0d-ai-specifikacio.md
 * §9.3 — it doesn't exist on this direct-engine path, same precedent as
 * Hotel's/Ramses' own simulate.ts).
 */
function driveOneStep(state: DamaState, difficultyOf: (player: Player) => DamaAiDifficulty): DamaState {
  const action = chooseDamaAiAction(state, difficultyOf(state.currentPlayer));
  // Shouldn't happen while status is IN_PROGRESS (the reducer only ever
  // leaves a player IN_PROGRESS if they have a legal move — see
  // withWinCheck/hasAnyLegalMove in reducer.ts/rules.ts) — but a simulation
  // runner must never hang, so treat "nothing to do" as a forced stop.
  if (!action) return { ...state, status: 'DRAW' };
  return reducer(state, action);
}

/**
 * Runs one full Dáma game with only AI players — a standalone module (no
 * lobby UI, no GameRoom/Colyseus, no database) for playing out many
 * matchups quickly, toward tuning the search depths/time budget (§5-6) and
 * the heuristic's weights (§4) — see docs/dama-0d-ai-specifikacio.md §13
 * (Dáma-0d.2). Runs to completion, or up to `maxSteps` (default 4000) as a
 * safety net: unlike Ramses (a finite 30-card deck) or Hotel (bankruptcy is
 * always eventually forced by mounting rent), Dáma's engine has no
 * repetition/no-progress draw rule, so a weak-AI king endgame could in
 * principle shuffle indefinitely.
 */
export function simulateDamaGame(config: SimulationConfig, maxSteps = DEFAULT_MAX_STEPS): SimulationResult {
  let state = createInitialState();
  const difficultyOf = (player: Player): DamaAiDifficulty => config[player];

  let steps = 0;
  while (state.status === 'IN_PROGRESS' && steps < maxSteps) {
    state = driveOneStep(state, difficultyOf);
    steps += 1;
  }

  const winner: Player | null =
    state.status === 'LIGHT_WON' ? 'LIGHT' : state.status === 'DARK_WON' ? 'DARK' : null;

  return {
    config,
    winner,
    steps,
    reachedStepCap: state.status === 'IN_PROGRESS',
    finalPieceCount: { LIGHT: countPieces(state, 'LIGHT'), DARK: countPieces(state, 'DARK') },
  };
}

