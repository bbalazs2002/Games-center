import { describe, expect, it } from 'vitest';
import { findCaptureMoves, findSimpleMoves, hasAnyCapture, hasAnyLegalMove } from './rules';
import { king, man, pos, stateWith, withPieces } from './testHelpers';

describe('findSimpleMoves', () => {
  it('a MAN csak átlósan előre léphet üres mezőre', () => {
    const state = stateWith({ board: withPieces([[pos(5, 0), man('LIGHT')]]) });
    const moves = findSimpleMoves(state, pos(5, 0));
    expect(moves).toEqual([{ row: 4, col: 1 }]); // (4,-1) tábla szélén kívül esik
  });

  it('a MAN-t blokkolja egy másik bábu (sajátja is)', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(4, 1), man('LIGHT')],
      ]),
    });
    expect(findSimpleMoves(state, pos(5, 0))).toEqual([]);
  });

  it('a KING repülve mozog, amíg üres a mező', () => {
    const state = stateWith({ board: withPieces([[pos(4, 4), king('LIGHT')]]) });
    const moves = findSimpleMoves(state, pos(4, 4));
    expect(moves).toContainEqual({ row: 0, col: 0 });
    expect(moves).toContainEqual({ row: 7, col: 7 });
  });

  it('a KING mozgását blokkolja egy útban álló bábu', () => {
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
  it('a MAN bármely 4 átlós irányban üthet', () => {
    const state = stateWith({
      board: withPieces([
        [pos(4, 4), man('LIGHT')],
        [pos(3, 3), man('DARK')],
      ]),
    });
    expect(findCaptureMoves(state, pos(4, 4))).toEqual([{ to: pos(2, 2), captured: pos(3, 3) }]);
  });

  it('nincs ütés, ha a célmező foglalt', () => {
    const state = stateWith({
      board: withPieces([
        [pos(4, 4), man('LIGHT')],
        [pos(3, 3), man('DARK')],
        [pos(2, 2), man('LIGHT')],
      ]),
    });
    expect(findCaptureMoves(state, pos(4, 4))).toEqual([]);
  });

  it('a KING repülő ütéssel több lehetséges landolási mezőt is felkínál', () => {
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

  it('a KING nem ugorhat át két bábun egy irányban', () => {
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
  it('igaz, ha a játékos bármely bábuja üthet', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(4, 1), man('DARK')],
      ]),
    });
    expect(hasAnyCapture(state, 'LIGHT')).toBe(true);
    expect(hasAnyCapture(state, 'DARK')).toBe(false);
  });

  it('hasAnyLegalMove hamis, ha a játékosnak nincs bábuja', () => {
    const state = stateWith({ board: withPieces([[pos(5, 0), man('LIGHT')]]) });
    expect(hasAnyLegalMove(state, 'DARK')).toBe(false);
  });
});
