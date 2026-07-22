import { describe, expect, it } from 'vitest';
import { createInitialState } from './initialState';
import { reducer } from './reducer';
import { king, man, pos, stateWith, withPieces } from './testHelpers';

describe('reducer — initial state', () => {
  it('LIGHT starts, 12-12 pieces on the board', () => {
    const state = createInitialState();
    expect(state.currentPlayer).toBe('LIGHT');
    const pieces = state.board.flat().filter(Boolean);
    expect(pieces).toHaveLength(24);
    expect(pieces.filter((p) => p?.player === 'LIGHT')).toHaveLength(12);
    expect(pieces.filter((p) => p?.player === 'DARK')).toHaveLength(12);
  });
});

describe('reducer — simple move', () => {
  it('after a valid move the piece moves and the turn passes', () => {
    // The distant DARK piece only exists so DARK has a move —
    // without it the test would accidentally trigger win detection too.
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(0, 7), man('DARK')],
      ]),
    });
    const next = reducer(state, { type: 'MOVE', from: pos(5, 0), to: pos(4, 1) });

    expect(next.board[5][0]).toBeNull();
    expect(next.board[4][1]).toEqual(man('LIGHT'));
    expect(next.currentPlayer).toBe('DARK');
    expect(next.chainCaptureFrom).toBeNull();
    expect(next.status).toBe('IN_PROGRESS');
  });

  it('moving to an invalid target square is a no-op (same state reference)', () => {
    const state = stateWith({ board: withPieces([[pos(5, 0), man('LIGHT')]]) });
    const next = reducer(state, { type: 'MOVE', from: pos(5, 0), to: pos(3, 0) });
    expect(next).toBe(state);
  });

  it('mandatory-capture rule: a non-capturing move is invalid if a capture is available elsewhere', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(4, 1), man('DARK')], // (5,0) has a capture available
        [pos(5, 4), man('LIGHT')], // this one would only have a simple move
      ]),
    });
    const next = reducer(state, { type: 'MOVE', from: pos(5, 4), to: pos(4, 3) });
    expect(next).toBe(state);
  });
});

describe('reducer — capture', () => {
  it('capturing removes the piece, and the turn passes if no further capture is available', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(4, 1), man('DARK')],
      ]),
    });
    const next = reducer(state, { type: 'MOVE', from: pos(5, 0), to: pos(3, 2) });

    expect(next.board[4][1]).toBeNull();
    expect(next.board[3][2]).toEqual(man('LIGHT'));
    expect(next.currentPlayer).toBe('DARK');
    expect(next.chainCaptureFrom).toBeNull();
  });

  it('chain capture: the turn does not pass while the same piece can keep capturing', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(4, 1), man('DARK')],
        [pos(2, 3), man('DARK')],
        [pos(5, 4), man('LIGHT')], // must not be the only LIGHT piece — a bystander for testing the chain-capture constraint
        [pos(0, 7), man('DARK')], // DARK must not run out of pieces — this test is about chain capture, not about winning
      ]),
    });

    const afterFirstHop = reducer(state, { type: 'MOVE', from: pos(5, 0), to: pos(3, 2) });
    expect(afterFirstHop.currentPlayer).toBe('LIGHT');
    expect(afterFirstHop.chainCaptureFrom).toEqual(pos(3, 2));
    expect(afterFirstHop.board[4][1]).toBeNull();

    // Moving a different piece mid-chain is illegal.
    const illegalOtherPiece = reducer(afterFirstHop, { type: 'MOVE', from: pos(5, 4), to: pos(4, 3) });
    expect(illegalOtherPiece).toBe(afterFirstHop);

    const afterSecondHop = reducer(afterFirstHop, { type: 'MOVE', from: pos(3, 2), to: pos(1, 4) });
    expect(afterSecondHop.board[2][3]).toBeNull();
    expect(afterSecondHop.board[1][4]).toEqual(man('LIGHT'));
    expect(afterSecondHop.currentPlayer).toBe('DARK');
    expect(afterSecondHop.chainCaptureFrom).toBeNull();
    expect(afterSecondHop.status).toBe('IN_PROGRESS');
  });
});

describe('reducer — promotion', () => {
  it('reaching the last row with a simple move turns the piece into a king', () => {
    const state = stateWith({ board: withPieces([[pos(1, 0), man('LIGHT')]]) });
    const next = reducer(state, { type: 'MOVE', from: pos(1, 0), to: pos(0, 1) });
    expect(next.board[0][1]).toEqual(king('LIGHT'));
  });

  it('rule choice: promotion ends the chain capture even if a further capture would be available', () => {
    const state = stateWith({
      board: withPieces([
        [pos(2, 1), man('LIGHT')],
        [pos(1, 2), man('DARK')],
        [pos(1, 4), man('DARK')], // a king at (0,3) could capture this, but it doesn't continue after promotion
      ]),
    });
    const next = reducer(state, { type: 'MOVE', from: pos(2, 1), to: pos(0, 3) });

    expect(next.board[0][3]).toEqual(king('LIGHT'));
    expect(next.currentPlayer).toBe('DARK');
    expect(next.chainCaptureFrom).toBeNull();
  });
});

describe('reducer — win detection', () => {
  it('capturing the opponent’s last piece wins the game for the moving side', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(4, 1), man('DARK')], // DARK's only piece
      ]),
    });
    const next = reducer(state, { type: 'MOVE', from: pos(5, 0), to: pos(3, 2) });
    expect(next.status).toBe('LIGHT_WON');
  });
});
