import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseRamsesAiAction } from './strategy';
import { createRevealMemory, observeRevealedState, recallEasy, type RevealMemory } from './memory';
import { reducer } from '../engine/reducer';
import { createInitialState } from '../engine/initialState';
import { toPublicRamsesState } from '../engine/rules';
import { buildTestState, updateCell } from '../engine/testHelpers';
import type { RamsesState } from '../engine/state';

/** Interior empty cell (r2c3) with 4 real neighbors — buildTestState's default corner (r0c0) only has 2, not enough for the 3/4-way tiered scenarios below. */
function buildInteriorEmptyState(overrides: Partial<RamsesState> = {}): RamsesState {
  let state = buildTestState(overrides);
  state = updateCell(state, 'r0c0', { hasPyramid: true });
  state = updateCell(state, 'r2c3', { hasPyramid: false });
  return { ...state, emptyCellId: 'r2c3' };
}

/** Disables recall()'s simulated forgetting (see memory.ts) — every difficulty's FORGET_CHANCE is < 0.99, so this makes the tiered-preference logic deterministic to test in isolation from the (separately tested) forgetting mechanism. */
function disableForgetting(): void {
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
}

describe('chooseRamsesAiAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when it is not the given slot\'s turn', () => {
    const state = buildTestState({ currentPlayerIndex: 0 });
    expect(chooseRamsesAiAction(state, createRevealMemory(), 'player-2', 'EASY')).toBeNull();
  });

  it('returns null once the game has finished (nothing slidable)', () => {
    const state = buildTestState({ status: 'FINISHED' });
    expect(chooseRamsesAiAction(state, createRevealMemory(), 'player-1', 'HARD')).toBeNull();
  });

  describe('EASY', () => {
    it('ignores the FULL memory (never avoids a known-wrong cell) — picks among slidable cells even when the full memory marks all of them as wrong', () => {
      let state = buildInteriorEmptyState({ activeCard: { id: 'c1', treasureId: 'ankh', points: 2 } });
      state = updateCell(state, 'r1c3', { treasureId: 'scarab' });
      state = updateCell(state, 'r3c3', { treasureId: 'lotus' });
      state = updateCell(state, 'r2c2', { treasureId: 'eye' });
      state = updateCell(state, 'r2c4', { treasureId: 'ibis' });
      const memory = createRevealMemory();
      // Populate the FULL memory only (as MEDIUM/HARD would see it via recall()) — never the bounded recentKeys window.
      for (const cellId of ['r1c3', 'r3c3', 'r2c2', 'r2c4']) memory.full.set(cellId, state.board.find((c) => c.id === cellId)!.treasureId);

      const action = chooseRamsesAiAction(state, memory, 'player-1', 'EASY');
      expect(action?.type).toBe('SLIDE_PYRAMID');
      expect(['r1c3', 'r3c3', 'r2c2', 'r2c4']).toContain(action && 'fromCellId' in action ? action.fromCellId : undefined);
    });

    it('takes an obvious win if the winning cell is within its short-term (recallEasy) window — see docs/ramses-0c-ai-specifikacio.md §3.3.2', () => {
      const state = buildInteriorEmptyState({ activeCard: { id: 'c1', treasureId: 'ankh', points: 2 } });
      const stateWithTreasure = updateCell(state, 'r2c4', { treasureId: 'ankh' });
      const memory = createRevealMemory();
      // Simulate having JUST observed r2c4 (e.g. it was the empty cell a moment ago).
      observeRevealedState(memory, { ...stateWithTreasure, emptyCellId: 'r2c4' });
      expect(recallEasy(memory, 'r2c4')).toBe('ankh'); // sanity: within the recent window

      const action = chooseRamsesAiAction(stateWithTreasure, memory, 'player-1', 'EASY');
      expect(action).toEqual({ type: 'SLIDE_PYRAMID', fromCellId: 'r2c4' });
    });

    it('does NOT avoid a known-wrong cell even if it is within the recent window (unlike MEDIUM/HARD) — only recognizes wins, never dangers', () => {
      let state = buildInteriorEmptyState({ activeCard: { id: 'c1', treasureId: 'ankh', points: 2 } });
      state = updateCell(state, 'r1c3', { treasureId: 'scarab' }); // wrong treasure, but recently seen
      const memory = createRevealMemory();
      observeRevealedState(memory, { ...state, emptyCellId: 'r1c3' });
      expect(recallEasy(memory, 'r1c3')).toBe('scarab'); // sanity: within the recent window, and NOT the active target

      const action = chooseRamsesAiAction(state, memory, 'player-1', 'EASY');
      expect(action?.type).toBe('SLIDE_PYRAMID');
      // r1c3 remains a legitimate candidate — EASY has no concept of "avoid".
      expect(['r1c3', 'r3c3', 'r2c2', 'r2c4']).toContain(action && 'fromCellId' in action ? action.fromCellId : undefined);
    });
  });

  describe('MEDIUM', () => {
    it('avoids a cell it recalls as the wrong treasure when a safe alternative exists', () => {
      disableForgetting();
      let state = buildInteriorEmptyState({ activeCard: { id: 'c1', treasureId: 'ankh', points: 2 } });
      state = updateCell(state, 'r1c3', { treasureId: 'scarab' }); // known WRONG treasure
      // r3c3/r2c2/r2c4 stay treasureId: null (blank) in the true state, but MEDIUM never looks at that directly — only at memory.
      const memory = createRevealMemory();
      memory.full.set('r1c3', 'scarab');

      const action = chooseRamsesAiAction(state, memory, 'player-1', 'MEDIUM');
      expect(action).toEqual({ type: 'SLIDE_PYRAMID', fromCellId: expect.not.stringMatching('r1c3') });
    });

    it('is forced onto a known-wrong cell when ALL slidable cells are known-wrong', () => {
      disableForgetting();
      const state = buildInteriorEmptyState({ activeCard: { id: 'c1', treasureId: 'ankh', points: 2 } });
      const memory = createRevealMemory();
      for (const cellId of ['r1c3', 'r3c3', 'r2c2', 'r2c4']) memory.full.set(cellId, 'scarab'); // all wrong, none match "ankh"

      const action = chooseRamsesAiAction(state, memory, 'player-1', 'MEDIUM');
      expect(action?.type).toBe('SLIDE_PYRAMID');
      expect(['r1c3', 'r3c3', 'r2c2', 'r2c4']).toContain(action && 'fromCellId' in action ? action.fromCellId : undefined);
    });
  });

  describe('HARD', () => {
    it('prefers a remembered WINNING cell over a known-blank, unknown, or known-wrong cell', () => {
      disableForgetting();
      const state = buildInteriorEmptyState({ activeCard: { id: 'c1', treasureId: 'ankh', points: 2 } });
      const memory = createRevealMemory();
      memory.full.set('r1c3', 'scarab'); // known wrong
      memory.full.set('r3c3', null); // known blank
      // r2c2 left unknown (not in memory)
      memory.full.set('r2c4', 'ankh'); // the winning cell

      const action = chooseRamsesAiAction(state, memory, 'player-1', 'HARD');
      expect(action).toEqual({ type: 'SLIDE_PYRAMID', fromCellId: 'r2c4' });
    });

    it('prefers a remembered BLANK cell over an unknown or known-wrong cell when no win is known', () => {
      disableForgetting();
      const state = buildInteriorEmptyState({ activeCard: { id: 'c1', treasureId: 'ankh', points: 2 } });
      const memory = createRevealMemory();
      memory.full.set('r1c3', 'scarab'); // known wrong
      // r3c3 unknown
      memory.full.set('r2c2', null); // the known-blank cell
      // r2c4 unknown

      const action = chooseRamsesAiAction(state, memory, 'player-1', 'HARD');
      expect(action).toEqual({ type: 'SLIDE_PYRAMID', fromCellId: 'r2c2' });
    });

    it('prefers an UNKNOWN cell over a known-wrong cell when no win or blank is known', () => {
      disableForgetting();
      const state = buildInteriorEmptyState({ activeCard: { id: 'c1', treasureId: 'ankh', points: 2 } });
      const memory = createRevealMemory();
      memory.full.set('r1c3', 'scarab'); // known wrong
      memory.full.set('r3c3', 'lotus'); // known wrong
      memory.full.set('r2c2', 'eye'); // known wrong
      // r2c4 stays unknown — the only non-bad option

      const action = chooseRamsesAiAction(state, memory, 'player-1', 'HARD');
      expect(action).toEqual({ type: 'SLIDE_PYRAMID', fromCellId: 'r2c4' });
    });

    it('is forced onto a known-wrong cell only when every slidable cell is known-wrong', () => {
      disableForgetting();
      const state = buildInteriorEmptyState({ activeCard: { id: 'c1', treasureId: 'ankh', points: 2 } });
      const memory = createRevealMemory();
      for (const cellId of ['r1c3', 'r3c3', 'r2c2', 'r2c4']) memory.full.set(cellId, 'scarab');

      const action = chooseRamsesAiAction(state, memory, 'player-1', 'HARD');
      expect(action?.type).toBe('SLIDE_PYRAMID');
      expect(['r1c3', 'r3c3', 'r2c2', 'r2c4']).toContain(action && 'fromCellId' in action ? action.fromCellId : undefined);
    });
  });
});

describe('AI-only full game (smoke test)', () => {
  // Mirrors Hotel's own AI-only smoke test philosophy (src/shared/games/hotel/ai/strategy.test.ts):
  // NOT asserting the game always reaches FINISHED within the cap. A
  // mixed-difficulty game (an EASY slot does a genuinely memory-blind random
  // walk) has no guaranteed upper bound on how long it takes to exhaust the
  // 30-card deck (empirically ~15,000-20,000 slides in typical runs, but
  // that's an unbounded-tail random process, not a hard guarantee — a fixed
  // cap can never be 100% certain to be enough without reseeding the RNG,
  // which this module doesn't support). The actual point of this test is
  // that driving a real, varied slice of AI decisions (blank reveals, wrong-
  // treasure turn-passes, memory-informed choices, occasional forgetting)
  // for many steps never throws and never gets stuck returning no action.
  it(
    'runs many steps without throwing, mixing all three difficulties, memory correctly updated throughout',
    () => {
      const difficulties: Array<'EASY' | 'MEDIUM' | 'HARD'> = ['EASY', 'MEDIUM', 'HARD'];
      let state = createInitialState(['Alice', 'Bob', 'Carol']);
      const memory: RevealMemory = createRevealMemory();
      observeRevealedState(memory, toPublicRamsesState(state));

      const MAX_STEPS = 5000;
      let steps = 0;
      while (state.status === 'IN_PROGRESS' && steps < MAX_STEPS) {
        const slot = state.players[state.currentPlayerIndex].id;
        const difficulty = difficulties[state.currentPlayerIndex % difficulties.length];
        const action = chooseRamsesAiAction(toPublicRamsesState(state), memory, slot, difficulty);
        if (!action) throw new Error(`No action available for ${slot} at step ${steps}`);
        state = reducer(state, action);
        observeRevealedState(memory, toPublicRamsesState(state));
        steps += 1;
      }

      expect(steps).toBeGreaterThan(0);
    },
    15_000,
  );
});
