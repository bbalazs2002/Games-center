import { describe, expect, it } from 'vitest';
import { createInitialState } from './initialState';
import { getPlayer, renamePlayer } from './rules';

describe('renamePlayer', () => {
  it('replaces the placeholder name with the real one, leaving everything else untouched', () => {
    const state = createInitialState(['1. játékos', '2. játékos']);
    const next = renamePlayer(state, 'player-1', 'Alice');
    expect(getPlayer(next, 'player-1').name).toBe('Alice');
    expect(getPlayer(next, 'player-1').cash).toBe(getPlayer(state, 'player-1').cash);
    expect(getPlayer(next, 'player-2').name).toBe('2. játékos');
  });
});
