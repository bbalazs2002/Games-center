import { ArraySchema } from '@colyseus/schema';
import { describe, expect, it } from 'vitest';
import { replaceStringArray } from './colyseusSyncHelpers';

describe('replaceStringArray', () => {
  it('replaces a populated array with a shorter one', () => {
    const target = new ArraySchema<string>('a', 'b', 'c');
    replaceStringArray(target, ['x']);
    expect([...target]).toEqual(['x']);
  });

  it('replaces a populated array with an equal-length one', () => {
    const target = new ArraySchema<string>('a', 'b');
    replaceStringArray(target, ['x', 'y']);
    expect([...target]).toEqual(['x', 'y']);
  });

  /**
   * Real bug, caught 2026-07-30 testing Ramses's FORFEIT action in genuine
   * multiplayer: @colyseus/schema's own ArraySchema#splice() throws
   * ("insertCount must be equal or lower than deleteCount") if you try to
   * net-insert in one splice call — exactly what a naive
   * `target.splice(0, target.length, ...values)` does the moment `values`
   * is LONGER than the array's previous (possibly empty) contents. This is
   * exactly the winnerIds transition every game-ending state hits (empty
   * mid-game -> non-empty once a winner exists), so this was silently
   * crashing state sync for every Ramses game that ever finished online,
   * and for Hotel's passedPlayerIds/lotsWithStaircasePurchasedThisTurn the
   * first time either ever went from empty to non-empty too.
   */
  it('replaces an EMPTY array with a non-empty one, without throwing', () => {
    const target = new ArraySchema<string>();
    expect(() => replaceStringArray(target, ['player-2'])).not.toThrow();
    expect([...target]).toEqual(['player-2']);
  });

  it('replaces a populated array with a longer one', () => {
    const target = new ArraySchema<string>('a');
    replaceStringArray(target, ['x', 'y', 'z']);
    expect([...target]).toEqual(['x', 'y', 'z']);
  });

  it('replaces with an empty array, clearing the target', () => {
    const target = new ArraySchema<string>('a', 'b');
    replaceStringArray(target, []);
    expect([...target]).toEqual([]);
  });
});
