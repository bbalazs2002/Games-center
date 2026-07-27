import type { HotelAction } from '../engine/actions';
import { reducer } from '../engine/reducer';
import type { HotelState, PlayerId } from '../engine/state';
import { chanceOutcomes, enumerateCandidateActions, getActingId, isChanceNodePhase } from './actionEnumerator';
import { evaluateState } from './heuristic';

// Hard wall-clock cap per computeAiMove call, independent of the configured
// difficulty's own-move depth — see docs/hotel-0d-ai-specifikacio.md §4.5.
// Once passed, every still-open branch is evaluated with the plain
// heuristic instead of expanded further (depth-limited-search cutoff,
// just triggered by time instead of depth).
const SEARCH_TIME_BUDGET_MS = 200;
// Second, independent safety net alongside the wall-clock deadline: a
// runaway recursion (e.g. a future action-enumerator/reducer mismatch that
// produces a candidate the reducer silently no-ops) can blow the JS call
// stack in well under SEARCH_TIME_BUDGET_MS, since stack depth — unlike
// total elapsed time — isn't bounded by how much wall-clock work each frame
// does. A single Hotel turn never legitimately needs anywhere near this many
// nested actions.
const MAX_NODE_DEPTH = 300;

function terminalValue(state: HotelState, rootId: PlayerId): number {
  return state.winnerId === rootId ? 1_000_000 : -1_000_000;
}

/**
 * One-ply greedy pick — the policy every actor OTHER than the search's root
 * uses during self-play (see docs/hotel-0d-ai-specifikacio.md §4.2). Never
 * recurses, so simulating a whole opponent turn this way stays cheap
 * regardless of the root's configured depth.
 */
function greedyAction(state: HotelState, actorId: PlayerId): HotelAction | null {
  const candidates = enumerateCandidateActions(state, actorId);
  if (candidates.length === 0) return null;
  let best: HotelAction | null = null;
  let bestValue = -Infinity;
  for (const action of candidates) {
    const nextState = reducer(state, action);
    if (nextState === state) continue; // no-op guard-rejection — see actionEnumerator.ts's constructionOptions note
    const value = evaluateState(nextState, actorId);
    if (value > bestValue) {
      bestValue = value;
      best = action;
    }
  }
  return best ?? candidates[0];
}

function evaluateChanceNode(
  state: HotelState,
  rootId: PlayerId,
  ownPliesRemaining: number,
  deadline: number,
  nodeDepth: number,
): number {
  let expected = 0;
  for (const { action, probability } of chanceOutcomes(state)) {
    expected += probability * evaluateNode(reducer(state, action), rootId, ownPliesRemaining, deadline, nodeDepth + 1);
  }
  return expected;
}

/** Any actor other than the search's root — simulated via the cheap one-ply greedy policy, never expanded further (see docs/hotel-0d-ai-specifikacio.md §4.2). */
function evaluateOpponentDecision(
  state: HotelState,
  rootId: PlayerId,
  actingId: PlayerId,
  ownPliesRemaining: number,
  deadline: number,
  nodeDepth: number,
): number {
  const action = greedyAction(state, actingId);
  // A no-op guard-rejection (see actionEnumerator.ts's constructionOptions
  // note) would otherwise recurse on an unchanged state forever — treat it
  // as a dead end instead of trusting every enumerated action blindly.
  if (!action) return evaluateState(state, rootId);
  const nextState = reducer(state, action);
  if (nextState === state) return evaluateState(state, rootId);
  return evaluateNode(nextState, rootId, ownPliesRemaining, deadline, nodeDepth + 1);
}

/** The search root's own decision — fully expanded over every candidate, up to `ownPliesRemaining` of its own full turns ahead. */
function evaluateRootDecision(
  state: HotelState,
  rootId: PlayerId,
  ownPliesRemaining: number,
  deadline: number,
  nodeDepth: number,
): number {
  if (ownPliesRemaining <= 0) return evaluateState(state, rootId);

  const candidates = enumerateCandidateActions(state, rootId);
  if (candidates.length === 0) return evaluateState(state, rootId);

  let best = -Infinity;
  for (const action of candidates) {
    const nextState = reducer(state, action);
    if (nextState === state) continue; // no-op guard-rejection — doesn't lead anywhere new, skip it
    const nextOwnPliesRemaining =
      action.type === 'END_TURN' || action.type === 'FORFEIT' ? ownPliesRemaining - 1 : ownPliesRemaining;
    const value = evaluateNode(nextState, rootId, nextOwnPliesRemaining, deadline, nodeDepth + 1);
    if (value > best) best = value;
  }
  return best === -Infinity ? evaluateState(state, rootId) : best;
}

function evaluateNode(
  state: HotelState,
  rootId: PlayerId,
  ownPliesRemaining: number,
  deadline: number,
  nodeDepth: number,
): number {
  if (state.status === 'FINISHED') return terminalValue(state, rootId);
  if (nodeDepth >= MAX_NODE_DEPTH || Date.now() > deadline) return evaluateState(state, rootId);
  if (isChanceNodePhase(state)) return evaluateChanceNode(state, rootId, ownPliesRemaining, deadline, nodeDepth);

  const actingId = getActingId(state);
  if (!actingId) return evaluateState(state, rootId); // shouldn't happen structurally — defensive leaf

  return actingId === rootId
    ? evaluateRootDecision(state, rootId, ownPliesRemaining, deadline, nodeDepth)
    : evaluateOpponentDecision(state, rootId, actingId, ownPliesRemaining, deadline, nodeDepth);
}

/**
 * Picks the best action for `actorId` right now, looking `ownPlies` of
 * actorId's own full turns ahead (see docs/hotel-0d-ai-specifikacio.md
 * §4.2-4.5): dice/permit rolls are chance nodes (expectation over weighted
 * outcomes), every other actor is simulated via the cheap one-ply greedy
 * policy, and a wall-clock deadline caps runaway search regardless of
 * `ownPlies`. Returns null if `actorId` has nothing to legally do right now.
 */
export function chooseBestAction(state: HotelState, actorId: PlayerId, ownPlies: number): HotelAction | null {
  const candidates = enumerateCandidateActions(state, actorId);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const deadline = Date.now() + SEARCH_TIME_BUDGET_MS;
  let best = candidates[0];
  let bestValue = -Infinity;
  for (const action of candidates) {
    const nextState = reducer(state, action);
    if (nextState === state) continue; // no-op guard-rejection — see actionEnumerator.ts's constructionOptions note
    const nextOwnPlies = action.type === 'END_TURN' || action.type === 'FORFEIT' ? ownPlies - 1 : ownPlies;
    const value = evaluateNode(nextState, actorId, nextOwnPlies, deadline, 0);
    if (value > bestValue) {
      bestValue = value;
      best = action;
    }
  }
  return best;
}
