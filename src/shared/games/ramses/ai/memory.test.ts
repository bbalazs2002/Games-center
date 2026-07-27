import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRevealMemory, observeRevealedState, recall } from './memory';
import { buildTestState, updateCell } from '../engine/testHelpers';

describe('observeRevealedState', () => {
  it('records the treasure currently shown at the empty cell', () => {
    const memory = createRevealMemory();
    const state = updateCell(buildTestState(), 'r0c0', { treasureId: 'ankh' });
    observeRevealedState(memory, state);
    expect(memory.get('r0c0')).toBe('ankh');
  });

  it('records a blank empty cell as null (not "unobserved")', () => {
    const memory = createRevealMemory();
    observeRevealedState(memory, buildTestState()); // default empty cell (r0c0) has treasureId: null
    expect(memory.has('r0c0')).toBe(true);
    expect(memory.get('r0c0')).toBeNull();
  });

  it('a later observation overwrites the earlier one for the same cell', () => {
    const memory = createRevealMemory();
    observeRevealedState(memory, updateCell(buildTestState(), 'r0c0', { treasureId: 'ankh' }));
    observeRevealedState(memory, updateCell(buildTestState(), 'r0c0', { treasureId: null }));
    expect(memory.get('r0c0')).toBeNull();
  });

  it('accumulates entries for different cells across multiple calls (models watching several moves over a game)', () => {
    const memory = createRevealMemory();
    observeRevealedState(memory, { ...buildTestState({ emptyCellId: 'r0c1' }) });
    observeRevealedState(memory, { ...buildTestState({ emptyCellId: 'r1c0' }) });
    expect(memory.size).toBe(2);
  });
});

describe('recall', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('EASY never "forgets" (FORGET_CHANCE 0) — always returns the true memory value', () => {
    const memory = createRevealMemory();
    memory.set('r0c0', 'ankh');
    vi.spyOn(Math, 'random').mockReturnValue(0); // the most-forgetful possible roll
    expect(recall(memory, 'r0c0', 'EASY')).toBe('ankh');
  });

  it('returns undefined ("forgotten") when the random roll is below the difficulty\'s forget chance', () => {
    const memory = createRevealMemory();
    memory.set('r0c0', 'ankh');
    vi.spyOn(Math, 'random').mockReturnValue(0); // below any non-zero forget chance
    expect(recall(memory, 'r0c0', 'MEDIUM')).toBeUndefined();
    expect(recall(memory, 'r0c0', 'HARD')).toBeUndefined();
  });

  it('returns the true memory value when the random roll is above the forget chance', () => {
    const memory = createRevealMemory();
    memory.set('r0c0', 'ankh');
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // above any difficulty's forget chance
    expect(recall(memory, 'r0c0', 'MEDIUM')).toBe('ankh');
    expect(recall(memory, 'r0c0', 'HARD')).toBe('ankh');
  });

  it('forgetting never mutates the underlying memory — the same cell can be recalled successfully again later', () => {
    const memory = createRevealMemory();
    memory.set('r0c0', 'ankh');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    recall(memory, 'r0c0', 'HARD'); // "forgets" this time
    expect(memory.size).toBe(1);
    expect(memory.get('r0c0')).toBe('ankh'); // the Map itself is untouched
  });
});
