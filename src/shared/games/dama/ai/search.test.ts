import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../engine/initialState';
import { man, pos, stateWith, withPieces } from '../engine/testHelpers';
import type { DamaState } from '../engine/state';
import { findBestMoveFixedDepth, findBestMoveIterative } from './search';

describe('findBestMoveFixedDepth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when the current player has no movable piece', () => {
    const state = stateWith({ board: withPieces([]) });
    expect(findBestMoveFixedDepth(state, 4)).toBeNull();
  });

  it('returns a legal move for the starting position', () => {
    const state = createInitialState();
    const action = findBestMoveFixedDepth(state, 2);
    expect(action).not.toBeNull();
    expect(action?.type).toBe('MOVE');
  });

  it('looks 2 plies ahead to avoid a move that lets the opponent immediately recapture', () => {
    // LIGHT's only piece can step to (3,3) or (3,5). Stepping to (3,3) walks
    // straight into a DARK backward-capture (DARK men may capture in any
    // diagonal direction, see findManCaptureMoves in rules.ts) landing back
    // on the now-empty (4,4) — losing LIGHT's only piece. (3,5) is out of the
    // DARK man's reach, so it's the only safe choice.
    const state: DamaState = stateWith({
      board: withPieces([
        [pos(4, 4), man('LIGHT')],
        [pos(2, 2), man('DARK')],
      ]),
    });

    const action = findBestMoveFixedDepth(state, 2);
    expect(action).toEqual({ type: 'MOVE', from: pos(4, 4), to: pos(3, 5) });
  });

  it('breaks ties between equally-good moves RANDOMLY, not by always keeping the first one found (Dáma-0d.2 fix — see docs/dama-0d-ai-specifikacio.md §13.1, the root cause of MEDIUM vs MEDIUM getting stuck in a repeating cycle)', () => {
    // A single interior MAN, otherwise empty board — both forward destinations
    // land on the same row (identical advancement) with identical onward
    // mobility (2 open forward squares each), so they tie exactly at depth 1.
    const state: DamaState = stateWith({ board: withPieces([[pos(4, 3), man('LIGHT')]]) });

    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(findBestMoveFixedDepth(state, 1)).toEqual({ type: 'MOVE', from: pos(4, 3), to: pos(3, 2) });

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(findBestMoveFixedDepth(state, 1)).toEqual({ type: 'MOVE', from: pos(4, 3), to: pos(3, 4) });
  });
});

describe('findBestMoveIterative', () => {
  it('returns null when the current player has no movable piece', () => {
    const state = stateWith({ board: withPieces([]) });
    expect(findBestMoveIterative(state, 8, 200)).toBeNull();
  });

  it('finds the same safe move as the fixed-depth search once it reaches an equivalent depth, within a generous time budget', () => {
    const state: DamaState = stateWith({
      board: withPieces([
        [pos(4, 4), man('LIGHT')],
        [pos(2, 2), man('DARK')],
      ]),
    });

    const action = findBestMoveIterative(state, 6, 200);
    expect(action).toEqual({ type: 'MOVE', from: pos(4, 4), to: pos(3, 5) });
  });

  it('respects a very small time budget without throwing, still returning a legal move for the starting position', () => {
    const state = createInitialState();
    const action = findBestMoveIterative(state, 12, 5);
    expect(action).not.toBeNull();
    expect(action?.type).toBe('MOVE');
  });
});
