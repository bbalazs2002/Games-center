import { describe, expect, it } from 'vitest';
import { createInitialState } from '../engine/initialState';
import { king, man, pos, stateWith, withPieces } from '../engine/testHelpers';
import { evaluateDamaState } from './heuristic';

describe('evaluateDamaState', () => {
  it('is exactly 0 for the symmetric starting position, for either player', () => {
    const state = createInitialState();
    expect(evaluateDamaState(state, 'LIGHT')).toBe(0);
    expect(evaluateDamaState(state, 'DARK')).toBe(0);
  });

  it('is a strict zero-sum: the two players\' scores are always exact opposites', () => {
    // toBeCloseTo (not toBe) so a +0/-0 sign mismatch from floating-point
    // negation doesn't fail an otherwise-correct 0 === 0 comparison.
    const state = createInitialState();
    expect(evaluateDamaState(state, 'LIGHT')).toBeCloseTo(-evaluateDamaState(state, 'DARK'));
  });

  it('rewards a material advantage', () => {
    const state = stateWith({
      board: withPieces([
        [pos(0, 1), man('LIGHT')],
        [pos(2, 1), man('LIGHT')],
        [pos(5, 0), man('DARK')],
      ]),
    });
    expect(evaluateDamaState(state, 'LIGHT')).toBeGreaterThan(0);
    expect(evaluateDamaState(state, 'DARK')).toBeLessThan(0);
  });

  it('values a king more than a man', () => {
    const withMan = stateWith({ board: withPieces([[pos(3, 3), man('LIGHT')], [pos(4, 4), man('DARK')]]) });
    const withKing = stateWith({ board: withPieces([[pos(3, 3), king('LIGHT')], [pos(4, 4), man('DARK')]]) });
    expect(evaluateDamaState(withKing, 'LIGHT')).toBeGreaterThan(evaluateDamaState(withMan, 'LIGHT'));
  });

  it('rewards a MAN standing closer to its promotion row, material and mobility held equal', () => {
    // Mirror-image single-MAN positions, far from any interaction, so mobility is identical (2 simple moves each) — isolates the advancement term.
    const advanced = stateWith({ board: withPieces([[pos(1, 1), man('LIGHT')]]) }); // one row from promotion (row 0)
    const notAdvanced = stateWith({ board: withPieces([[pos(6, 1), man('LIGHT')]]) }); // near its own back row
    expect(evaluateDamaState(advanced, 'LIGHT')).toBeGreaterThan(evaluateDamaState(notAdvanced, 'LIGHT'));
  });

  it('rewards greater mobility, with material AND advancement held equal (same row, only the column differs)', () => {
    // Both MANs sit on row 4 (identical advancement) — a central column has 2 open forward-diagonal squares, a side column only 1 (the other runs off the board).
    const central = stateWith({ board: withPieces([[pos(4, 4), man('DARK')]]) }); // -> (5,3) and (5,5), both open
    const edge = stateWith({ board: withPieces([[pos(4, 0), man('DARK')]]) }); // -> (5,-1) off-board, only (5,1) open
    expect(evaluateDamaState(central, 'DARK')).toBeGreaterThan(evaluateDamaState(edge, 'DARK'));
  });
});
