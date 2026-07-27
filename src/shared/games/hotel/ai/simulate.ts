import { createInitialState } from '../engine/initialState';
import { reducer } from '../engine/reducer';
import { computeHotelValue, getCurrentPlayer, getPlayer, getRemainingBidderIds, ownedLotsOf } from '../engine/rules';
import type { HotelState, PlayerId } from '../engine/state';
import { chooseHotelAiAction, type HotelAiDifficulty } from './index';

const DEFAULT_MAX_STEPS = 4000;

export interface SimulationPlayerConfig {
  name: string;
  difficulty: HotelAiDifficulty;
}

export interface SimulationPlayerResult {
  id: PlayerId;
  name: string;
  difficulty: HotelAiDifficulty;
  bankrupt: boolean;
  finalCash: number;
  /** cash + owned portfolio value (see heuristic.ts's own definition) — the plain end-of-game strength number, independent of the heuristic's opponent-risk term. */
  finalNetWorth: number;
}

export interface SimulationResult {
  players: SimulationPlayerResult[];
  winnerId: PlayerId | null;
  steps: number;
  /** True if the game didn't reach FINISHED within maxSteps — a real possibility with cautious AI on both sides, not necessarily a bug. */
  reachedStepCap: boolean;
}

function netWorth(state: HotelState, playerId: PlayerId): number {
  const portfolio = ownedLotsOf(state, playerId).reduce((sum, lot) => sum + computeHotelValue(lot), 0);
  return getPlayer(state, playerId).cash + portfolio;
}

/**
 * One step forward: whoever can legally act right now (the current
 * turn-holder, or — during an auction — the first remaining bidder) takes
 * their AI-chosen action. Mirrors GameRoom's tryApplyOneAiMove/
 * maybeTriggerAiMove, but pure, synchronous, and — per your request — with
 * NO artificial "AI gondolkodik" delay: this drives the engine directly
 * (createInitialState + chooseHotelAiAction + reducer), the same way
 * strategy.test.ts's smoke test does, never touching GameRoom/Colyseus at
 * all. That pacing delay is a GameRoom-only concept (HotelRoom.aiMoveDelayMs,
 * see docs/hotel-0d-ai-specifikacio.md §4.7) for making a LIVE room watchable
 * by a human — it doesn't exist on this path, so there's nothing to disable.
 */
function driveOneStep(state: HotelState, difficultyOf: (id: PlayerId) => HotelAiDifficulty): HotelState {
  const actorId = state.turnPhase === 'AUCTION_IN_PROGRESS' ? getRemainingBidderIds(state)[0] : getCurrentPlayer(state).id;
  const action = actorId ? chooseHotelAiAction(state, actorId, difficultyOf(actorId)) : null;
  // Shouldn't happen structurally (every reachable phase has at least one
  // legal action for whoever can act) — but a simulation runner must never
  // hang, so treat "nothing to do" as "this game is over" rather than loop.
  if (!action) return { ...state, status: 'FINISHED' };
  return reducer(state, action);
}

/**
 * Runs one full Hotel game with only AI players — a standalone module (no
 * lobby UI, no GameRoom/Colyseus, no database) for playing out many
 * matchups quickly to compare difficulty levels and gather data toward
 * tuning the heuristic's weights (see docs/hotel-0d-ai-specifikacio.md §4.3,
 * §7). Runs to completion, or up to `maxSteps` (default 4000) as a safety
 * net against a game that never naturally ends.
 */
export function simulateHotelGame(playerConfigs: SimulationPlayerConfig[], maxSteps = DEFAULT_MAX_STEPS): SimulationResult {
  let state = createInitialState(playerConfigs.map((config) => config.name));
  const difficultyById = new Map<PlayerId, HotelAiDifficulty>(
    state.players.map((player, i) => [player.id, playerConfigs[i].difficulty]),
  );
  const difficultyOf = (id: PlayerId): HotelAiDifficulty => difficultyById.get(id) ?? 'MEDIUM';

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
    finalCash: player.cash,
    finalNetWorth: netWorth(state, player.id),
  }));

  return {
    players,
    winnerId: state.winnerId,
    steps,
    reachedStepCap: state.status !== 'FINISHED',
  };
}
