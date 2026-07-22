import { describe, expect, it } from 'vitest';
import { getMovablePositions } from './selectors';
import { man, pos, stateWith, withPieces } from './testHelpers';

describe('getMovablePositions', () => {
  it('minden léphető saját bábu mezőjét visszaadja, ha nincs kötelező ütés', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')], // tud lépni
        [pos(5, 2), man('LIGHT')], // tud lépni
        [pos(0, 1), man('DARK')], // ellenfél bábuja, nem számít
      ]),
    });
    const movable = getMovablePositions(state);
    expect(movable).toContainEqual(pos(5, 0));
    expect(movable).toContainEqual(pos(5, 2));
    expect(movable).toHaveLength(2);
  });

  it('kötelező ütés esetén csak az ütni tudó bábu mezője léphető', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')], // tud ütni
        [pos(4, 1), man('DARK')],
        [pos(5, 4), man('LIGHT')], // csak sima lépése volna — kötelező ütés miatt nem léphető
      ]),
    });
    expect(getMovablePositions(state)).toEqual([pos(5, 0)]);
  });

  it('teljesen blokkolt bábu mezője nem szerepel az eredményben', () => {
    // (7,7)-nek egyetlen előre-átlója van a sarok miatt: (6,6) — azt egy ellenfél-bábu
    // foglalja, az ütéshez szükséges landolómező (5,5) pedig szintén foglalt.
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
