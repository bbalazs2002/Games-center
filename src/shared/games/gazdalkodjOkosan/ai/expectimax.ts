import type { GazdalkodjOkosanAction } from '../engine/actions';
import { reducer } from '../engine/reducer';
import { getCurrentPlayer } from '../engine/rules';
import type { GazdalkodjOkosanState, PlayerId } from '../engine/state';
import { chanceOutcomes, enumerateCandidateActions, isChanceNodePhase } from './actionEnumerator';
import { evaluateState } from './heuristic';

// Hard wall-clock cap per chooseBestAction call, independent of the
// configured difficulty's own-move depth — see
// docs/gazdalkodj-okosan-0d-ai-specifikacio.md §3.4. Once passed, every
// still-open branch is evaluated with the plain heuristic instead of
// expanded further (depth-limited-search cutoff, just triggered by time
// instead of depth). Same constant as Hotel's — this engine's own turns are
// structurally simpler (no auction, no building-permit rolls), so if
// anything this budget is more generous here than it needs to be.
const SEARCH_TIME_BUDGET_MS = 200;
// Second, independent safety net alongside the wall-clock deadline — see
// Hotel's expectimax.ts for the identical reasoning (a runaway recursion
// from an enumerator/reducer mismatch can blow the stack well under the time
// budget, since stack depth isn't bounded by wall-clock work per frame).
const MAX_NODE_DEPTH = 300;

function terminalValue(state: GazdalkodjOkosanState, rootId: PlayerId): number {
  return state.winnerId === rootId ? 1_000_000 : -1_000_000;
}

/**
 * One-ply greedy pick — the policy every actor OTHER than the search's root
 * uses during self-play (see docs/gazdalkodj-okosan-0d-ai-specifikacio.md
 * §3.4). Never recurses, so simulating a whole opponent turn this way stays
 * cheap regardless of the root's configured depth.
 */
function greedyAction(state: GazdalkodjOkosanState, actorId: PlayerId): GazdalkodjOkosanAction | null {
  const candidates = enumerateCandidateActions(state, actorId);
  if (candidates.length === 0) return null;
  let best: GazdalkodjOkosanAction | null = null;
  let bestValue = -Infinity;
  for (const action of candidates) {
    const nextState = reducer(state, action);
    if (nextState === state) continue; // no-op guard-rejection — shouldn't happen given the enumerator mirrors rules.ts, but never trust it blindly
    const value = evaluateState(nextState, actorId);
    if (value > bestValue) {
      bestValue = value;
      best = action;
    }
  }
  return best ?? candidates[0];
}

function evaluateChanceNode(state: GazdalkodjOkosanState, rootId: PlayerId, ownPliesRemaining: number, deadline: number, nodeDepth: number): number {
  let expected = 0;
  for (const { action, probability } of chanceOutcomes()) {
    expected += probability * evaluateNode(reducer(state, action), rootId, ownPliesRemaining, deadline, nodeDepth + 1);
  }
  return expected;
}

/** Any actor other than the search's root — simulated via the cheap one-ply greedy policy, never expanded further. */
function evaluateOpponentDecision(
  state: GazdalkodjOkosanState,
  rootId: PlayerId,
  actingId: PlayerId,
  ownPliesRemaining: number,
  deadline: number,
  nodeDepth: number,
): number {
  const action = greedyAction(state, actingId);
  if (!action) return evaluateState(state, rootId);
  const nextState = reducer(state, action);
  if (nextState === state) return evaluateState(state, rootId);
  return evaluateNode(nextState, rootId, ownPliesRemaining, deadline, nodeDepth + 1);
}

/** The search root's own decision — fully expanded over every candidate, up to `ownPliesRemaining` of its own full turns ahead. */
function evaluateRootDecision(state: GazdalkodjOkosanState, rootId: PlayerId, ownPliesRemaining: number, deadline: number, nodeDepth: number): number {
  if (ownPliesRemaining <= 0) return evaluateState(state, rootId);

  const candidates = enumerateCandidateActions(state, rootId);
  if (candidates.length === 0) return evaluateState(state, rootId);

  let best = -Infinity;
  for (const action of candidates) {
    const nextState = reducer(state, action);
    if (nextState === state) continue; // no-op guard-rejection — doesn't lead anywhere new, skip it
    const nextOwnPliesRemaining = action.type === 'END_TURN' ? ownPliesRemaining - 1 : ownPliesRemaining;
    const value = evaluateNode(nextState, rootId, nextOwnPliesRemaining, deadline, nodeDepth + 1);
    if (value > best) best = value;
  }
  return best === -Infinity ? evaluateState(state, rootId) : best;
}

function evaluateNode(state: GazdalkodjOkosanState, rootId: PlayerId, ownPliesRemaining: number, deadline: number, nodeDepth: number): number {
  if (state.status === 'FINISHED') return terminalValue(state, rootId);
  if (nodeDepth >= MAX_NODE_DEPTH || Date.now() > deadline) return evaluateState(state, rootId);
  if (isChanceNodePhase(state)) return evaluateChanceNode(state, rootId, ownPliesRemaining, deadline, nodeDepth);

  const actingId = getCurrentPlayer(state).id; // no out-of-turn actor in this engine — always the current player
  return actingId === rootId
    ? evaluateRootDecision(state, rootId, ownPliesRemaining, deadline, nodeDepth)
    : evaluateOpponentDecision(state, rootId, actingId, ownPliesRemaining, deadline, nodeDepth);
}

/**
 * Picks the best action for `actorId` right now, looking `ownPlies` of
 * actorId's own full turns ahead (see docs/gazdalkodj-okosan-0d-ai-specifikacio.md
 * §3.4): the dice roll is the only chance node (expectation over 6 weighted
 * outcomes), every other actor is simulated via the cheap one-ply greedy
 * policy, and a wall-clock deadline caps runaway search regardless of
 * `ownPlies`. Returns null if `actorId` has nothing to legally do right now
 * (shouldn't happen when called only from index.ts's already-guarded entry
 * point, but kept defensive to match every sibling game's AI contract).
 */
export function chooseBestAction(state: GazdalkodjOkosanState, actorId: PlayerId, ownPlies: number): GazdalkodjOkosanAction | null {
  const candidates = enumerateCandidateActions(state, actorId);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const deadline = Date.now() + SEARCH_TIME_BUDGET_MS;
  let best = candidates[0];
  let bestValue = -Infinity;
  for (const action of candidates) {
    const nextState = reducer(state, action);
    if (nextState === state) continue; // no-op guard-rejection — see enumerateCandidateActions's own guarantee
    const nextOwnPlies = action.type === 'END_TURN' ? ownPlies - 1 : ownPlies;
    const value = evaluateNode(nextState, actorId, nextOwnPlies, deadline, 0);
    if (value > bestValue) {
      bestValue = value;
      best = action;
    }
  }
  return best;
}
