import type { DamaAction } from '../engine/actions';
import { reducer } from '../engine/reducer';
import { getMovablePositions, getValidMoves } from '../engine/selectors';
import type { DamaState, Player } from '../engine/state';
import { evaluateDamaState } from './heuristic';

/**
 * Thrown (and caught) purely as an early-exit signal from deep inside the
 * recursive search once the wall-clock deadline passes — see
 * findBestMoveIterative. Node's call stack has no cheaper way to abort a
 * deeply recursive synchronous function than unwinding via an exception.
 */
class SearchTimeBudgetExceeded extends Error {}

// How often (in visited nodes) the deadline is actually checked — Date.now()
// itself has real overhead, so checking on every single node would slow the
// search down for no benefit at the millisecond scale this budget cares about.
const DEADLINE_CHECK_INTERVAL_NODES = 500;

interface DeadlineGuard {
  deadline: number;
  nodesSinceCheck: number;
}

function checkDeadline(guard: DeadlineGuard | null): void {
  if (!guard) return;
  guard.nodesSinceCheck += 1;
  if (guard.nodesSinceCheck < DEADLINE_CHECK_INTERVAL_NODES) return;
  guard.nodesSinceCheck = 0;
  if (Date.now() >= guard.deadline) throw new SearchTimeBudgetExceeded();
}

/**
 * Every reachable `MOVE` action for the state's current player, honoring the
 * mandatory-capture rule — reuses the same selectors the human-input path
 * uses, so the search can never consider an illegal move (see
 * docs/dama-0d-ai-specifikacio.md §3).
 */
function enumerateActions(state: DamaState): DamaAction[] {
  const actions: DamaAction[] = [];
  for (const from of getMovablePositions(state)) {
    for (const to of getValidMoves(state, from)) {
      actions.push({ type: 'MOVE', from, to });
    }
  }
  return actions;
}

/**
 * Minimax + alpha-beta over the true reducer-driven game tree. One tree level
 * is one applied MOVE action, not one full turn — a chain capture simply
 * keeps `state.currentPlayer` unchanged across a few consecutive levels, so
 * no special chain-aware bookkeeping is needed (see
 * docs/dama-0d-ai-specifikacio.md §3).
 */
function minimax(
  state: DamaState,
  depth: number,
  alpha: number,
  beta: number,
  maximizingPlayer: Player,
  guard: DeadlineGuard | null,
): number {
  checkDeadline(guard);
  const actions = state.status === 'IN_PROGRESS' ? enumerateActions(state) : [];
  if (depth === 0 || actions.length === 0) {
    return evaluateDamaState(state, maximizingPlayer);
  }

  const isMaximizing = state.currentPlayer === maximizingPlayer;
  let best = isMaximizing ? -Infinity : Infinity;
  let localAlpha = alpha;
  let localBeta = beta;
  for (const action of actions) {
    const nextState = reducer(state, action);
    const score = minimax(nextState, depth - 1, localAlpha, localBeta, maximizingPlayer, guard);
    if (isMaximizing) {
      best = Math.max(best, score);
      localAlpha = Math.max(localAlpha, best);
    } else {
      best = Math.min(best, score);
      localBeta = Math.min(localBeta, best);
    }
    if (localBeta <= localAlpha) break;
  }
  return best;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Fixed-depth minimax + alpha-beta — MEDIUM's strategy, and the per-depth
 * building block of the iterative-deepening search below (see
 * docs/dama-0d-ai-specifikacio.md §5).
 *
 * Ties for the best score are broken RANDOMLY among all tied actions, not by
 * always keeping the first one found (Dáma-0d.2 fix, see §13.1) — without
 * this, two equally-strong, fully deterministic AIs (MEDIUM vs MEDIUM, or
 * HARD vs HARD when the time budget happens to yield identical depths) could
 * walk into an exact repeating position cycle with no way to ever break out,
 * since neither side's evaluation ever changes. Random tie-breaking makes
 * that kind of stable cycle structurally unlikely to persist.
 */
export function findBestMoveFixedDepth(state: DamaState, depth: number, guard: DeadlineGuard | null = null): DamaAction | null {
  const actions = enumerateActions(state);
  if (actions.length === 0) return null;

  const maximizingPlayer = state.currentPlayer;
  let bestScore = -Infinity;
  let bestActions: DamaAction[] = [];
  let alpha = -Infinity;
  const beta = Infinity;
  for (const action of actions) {
    const nextState = reducer(state, action);
    const score = minimax(nextState, depth - 1, alpha, beta, maximizingPlayer, guard);
    if (score > bestScore) {
      bestScore = score;
      bestActions = [action];
    } else if (score === bestScore) {
      bestActions.push(action);
    }
    alpha = Math.max(alpha, bestScore);
  }
  return pickRandom(bestActions);
}

/**
 * Iterative deepening + alpha-beta up to `maxDepth`, bailing out as soon as
 * `timeBudgetMs` elapses — HARD's strategy (see
 * docs/dama-0d-ai-specifikacio.md §5-6). Always returns the best move from
 * the last FULLY completed depth, never a partially-searched one — a depth
 * that gets interrupted mid-search (SearchTimeBudgetExceeded) is discarded
 * entirely, not used even partially, since alpha-beta's running "best so far"
 * isn't reliable once pruning was based on an incomplete sibling comparison.
 */
export function findBestMoveIterative(state: DamaState, maxDepth: number, timeBudgetMs: number): DamaAction | null {
  const actions = enumerateActions(state);
  if (actions.length === 0) return null;

  const guard: DeadlineGuard = { deadline: Date.now() + timeBudgetMs, nodesSinceCheck: 0 };
  let bestAction: DamaAction = actions[0];
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    try {
      const result = findBestMoveFixedDepth(state, depth, guard);
      if (result) bestAction = result;
    } catch (error) {
      if (error instanceof SearchTimeBudgetExceeded) break;
      throw error;
    }
    if (Date.now() >= guard.deadline) break;
  }
  return bestAction;
}
