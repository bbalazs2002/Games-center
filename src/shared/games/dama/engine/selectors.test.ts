import { describe, expect, it } from 'vitest';
import { getMovablePositions } from './selectors';
import { man, pos, stateWith, withPieces } from './testHelpers';

describe('getMovablePositions', () => {
  it('returns every movable own-piece square when there is no mandatory capture', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')], // can move
        [pos(5, 2), man('LIGHT')], // can move
        [pos(0, 1), man('DARK')], // opponent's piece, doesn't count
      ]),
    });
    const movable = getMovablePositions(state);
    expect(movable).toContainEqual(pos(5, 0));
    expect(movable).toContainEqual(pos(5, 2));
    expect(movable).toHaveLength(2);
  });

  it('when a capture is mandatory, only the capturing piece is movable', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')], // can capture
        [pos(4, 1), man('DARK')],
        [pos(5, 4), man('LIGHT')], // would only have a simple move — not movable due to mandatory capture
      ]),
    });
    expect(getMovablePositions(state)).toEqual([pos(5, 0)]);
  });

  it('a fully blocked piece does not show up in the result', () => {
    // (7,7) has only one forward diagonal because of the corner: (6,6) — occupied
    // by an opponent piece, and the landing square needed for a capture, (5,5), is
    // also occupied.
    const state = stateWith({
      board: withPieces([
        [pos(7, 7), man('LIGHT')],
        [pos(6, 6), man('DARK')],
        [pos(5, 5), man('DARK')],
      ]),
    });
    expect(getMovablePositions(state)).toEqual([]);
  });
});
