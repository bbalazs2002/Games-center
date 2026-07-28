import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRevealMemory, observeRevealedState, recall, recallEasy } from './memory';
import { buildTestState, updateCell } from '../engine/testHelpers';

describe('observeRevealedState', () => {
  it('records the treasure currently shown at the empty cell', () => {
    const memory = createRevealMemory();
    const state = updateCell(buildTestState(), 'r0c0', { treasureId: 'ankh' });
    observeRevealedState(memory, state);
    expect(memory.full.get('r0c0')).toBe('ankh');
  });

  it('records a blank empty cell as null (not "unobserved")', () => {
    const memory = createRevealMemory();
    observeRevealedState(memory, buildTestState()); // default empty cell (r0c0) has treasureId: null
    expect(memory.full.has('r0c0')).toBe(true);
    expect(memory.full.get('r0c0')).toBeNull();
  });

  it('a later observation overwrites the earlier one for the same cell', () => {
    const memory = createRevealMemory();
    observeRevealedState(memory, updateCell(buildTestState(), 'r0c0', { treasureId: 'ankh' }));
    observeRevealedState(memory, updateCell(buildTestState(), 'r0c0', { treasureId: null }));
    expect(memory.full.get('r0c0')).toBeNull();
  });

  it('accumulates entries for different cells across multiple calls (models watching several moves over a game)', () => {
    const memory = createRevealMemory();
    observeRevealedState(memory, { ...buildTestState({ emptyCellId: 'r0c1' }) });
    observeRevealedState(memory, { ...buildTestState({ emptyCellId: 'r1c0' }) });
    expect(memory.full.size).toBe(2);
  });
});

describe('recall', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('EASY never "forgets" (FORGET_CHANCE 0) — always returns the true memory value (recall() itself, in isolation; EASY\'s actual strategy uses recallEasy() instead, see below)', () => {
    const memory = createRevealMemory();
    memory.full.set('r0c0', 'ankh');
    vi.spyOn(Math, 'random').mockReturnValue(0); // the most-forgetful possible roll
    expect(recall(memory, 'r0c0', 'EASY')).toBe('ankh');
  });

  it('returns undefined ("forgotten") when the random roll is below the difficulty\'s forget chance', () => {
    const memory = createRevealMemory();
    memory.full.set('r0c0', 'ankh');
    vi.spyOn(Math, 'random').mockReturnValue(0); // below any non-zero forget chance
    expect(recall(memory, 'r0c0', 'MEDIUM')).toBeUndefined();
    expect(recall(memory, 'r0c0', 'HARD')).toBeUndefined();
  });

  it('returns the true memory value when the random roll is above the forget chance', () => {
    const memory = createRevealMemory();
    memory.full.set('r0c0', 'ankh');
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // above any difficulty's forget chance
    expect(recall(memory, 'r0c0', 'MEDIUM')).toBe('ankh');
    expect(recall(memory, 'r0c0', 'HARD')).toBe('ankh');
  });

  it('forgetting never mutates the underlying memory — the same cell can be recalled successfully again later', () => {
    const memory = createRevealMemory();
    memory.full.set('r0c0', 'ankh');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    recall(memory, 'r0c0', 'HARD'); // "forgets" this time
    expect(memory.full.size).toBe(1);
    expect(memory.full.get('r0c0')).toBe('ankh'); // the Map itself is untouched
  });
});

describe('recallEasy', () => {
  it('returns undefined for a cell never observed', () => {
    const memory = createRevealMemory();
    expect(recallEasy(memory, 'r0c0')).toBeUndefined();
  });

  it('recalls a cell that was JUST observed', () => {
    const memory = createRevealMemory();
    observeRevealedState(memory, updateCell(buildTestState(), 'r0c0', { treasureId: 'ankh' }));
    expect(recallEasy(memory, 'r0c0')).toBe('ankh');
  });

  it('"forgets" (returns undefined) a cell once it falls outside the bounded recent window', () => {
    const memory = createRevealMemory();
    // Observe r0c0, then 4 other distinct cells — the window (3) should push r0c0 out.
    observeRevealedState(memory, updateCell(buildTestState({ emptyCellId: 'r0c0' }), 'r0c0', { treasureId: 'ankh' }));
    observeRevealedState(memory, buildTestState({ emptyCellId: 'r0c1' }));
    observeRevealedState(memory, buildTestState({ emptyCellId: 'r0c2' }));
    observeRevealedState(memory, buildTestState({ emptyCellId: 'r0c3' }));
    expect(recallEasy(memory, 'r0c0')).toBeUndefined(); // pushed out of the window
    expect(recallEasy(memory, 'r0c3')).toBeNull(); // still within the window (default blank)
    // The FULL memory (used by MEDIUM/HARD) never forgets it, unlike the bounded window:
    expect(memory.full.get('r0c0')).toBe('ankh');
  });

  it('re-observing an already-known cell refreshes its place in the recent window instead of duplicating it', () => {
    const memory = createRevealMemory();
    observeRevealedState(memory, updateCell(buildTestState({ emptyCellId: 'r0c0' }), 'r0c0', { treasureId: 'ankh' }));
    observeRevealedState(memory, buildTestState({ emptyCellId: 'r0c1' }));
    observeRevealedState(memory, buildTestState({ emptyCellId: 'r0c0' })); // re-observe r0c0 — refreshes recency
    observeRevealedState(memory, buildTestState({ emptyCellId: 'r0c2' }));
    // Window size 3: without the refresh, r0c0's first entry would have been pushed out by now.
    expect(recallEasy(memory, 'r0c0')).not.toBeUndefined();
    expect(memory.recentKeys).toHaveLength(3); // never duplicated despite being observed twice
  });
});
