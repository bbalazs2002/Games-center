import { describe, expect, it } from 'vitest';
import { findCaptureMoves, findSimpleMoves, hasAnyCapture, hasAnyLegalMove } from './rules';
import { king, man, pos, stateWith, withPieces } from './testHelpers';

describe('findSimpleMoves', () => {
  it('a MAN can only move diagonally forward onto an empty square', () => {
    const state = stateWith({ board: withPieces([[pos(5, 0), man('LIGHT')]]) });
    const moves = findSimpleMoves(state, pos(5, 0));
    expect(moves).toEqual([{ row: 4, col: 1 }]); // (4,-1) falls off the board
  });

  it('a MAN is blocked by another piece (even its own)', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(4, 1), man('LIGHT')],
      ]),
    });
    expect(findSimpleMoves(state, pos(5, 0))).toEqual([]);
  });

  it('a KING flies as long as the squares are empty', () => {
    const state = stateWith({ board: withPieces([[pos(4, 4), king('LIGHT')]]) });
    const moves = findSimpleMoves(state, pos(4, 4));
    expect(moves).toContainEqual({ row: 0, col: 0 });
    expect(moves).toContainEqual({ row: 7, col: 7 });
  });

  it("a KING's movement is blocked by a piece in its path", () => {
    const state = stateWith({
      board: withPieces([
        [pos(4, 4), king('LIGHT')],
        [pos(2, 2), man('DARK')],
      ]),
    });
    const moves = findSimpleMoves(state, pos(4, 4));
    expect(moves).not.toContainEqual({ row: 1, col: 1 });
    expect(moves).not.toContainEqual({ row: 0, col: 0 });
  });
});

describe('findCaptureMoves', () => {
  it('a MAN can capture in any of the 4 diagonal directions', () => {
    const state = stateWith({
      board: withPieces([
        [pos(4, 4), man('LIGHT')],
        [pos(3, 3), man('DARK')],
      ]),
    });
    expect(findCaptureMoves(state, pos(4, 4))).toEqual([{ to: pos(2, 2), captured: pos(3, 3) }]);
  });

  it('no capture if the target square is occupied', () => {
    const state = stateWith({
      board: withPieces([
        [pos(4, 4), man('LIGHT')],
        [pos(3, 3), man('DARK')],
        [pos(2, 2), man('LIGHT')],
      ]),
    });
    expect(findCaptureMoves(state, pos(4, 4))).toEqual([]);
  });

  it('a flying KING capture offers multiple possible landing squares', () => {
    const state = stateWith({
      board: withPieces([
        [pos(7, 0), king('LIGHT')],
        [pos(4, 3), man('DARK')],
      ]),
    });
    const moves = findCaptureMoves(state, pos(7, 0));
    expect(moves).toContainEqual({ to: pos(3, 4), captured: pos(4, 3) });
    expect(moves).toContainEqual({ to: pos(2, 5), captured: pos(4, 3) });
  });

  it('a KING cannot jump over two pieces in the same direction', () => {
    const state = stateWith({
      board: withPieces([
        [pos(7, 0), king('LIGHT')],
        [pos(4, 3), man('DARK')],
        [pos(3, 4), man('DARK')],
      ]),
    });
    expect(findCaptureMoves(state, pos(7, 0))).toEqual([]);
  });
});

describe('hasAnyCapture / hasAnyLegalMove', () => {
  it('true if any of the player pieces can capture', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(4, 1), man('DARK')],
      ]),
    });
    expect(hasAnyCapture(state, 'LIGHT')).toBe(true);
    expect(hasAnyCapture(state, 'DARK')).toBe(false);
  });

  it('hasAnyLegalMove is false if the player has no pieces', () => {
    const state = stateWith({ board: withPieces([[pos(5, 0), man('LIGHT')]]) });
    expect(hasAnyLegalMove(state, 'DARK')).toBe(false);
  });
});
