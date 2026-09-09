import { describe, expect, it } from 'vitest';
import { createInitialState as createHotelInitialState } from '@shared/games/hotel/engine/initialState';
import { createInitialState as createRamsesInitialState } from '@shared/games/ramses/engine/initialState';
import { createInitialState as createDamaInitialState } from '@shared/games/dama/engine/initialState';
import { createInitialState as createGazdalkodjOkosanInitialState } from '@shared/games/gazdalkodjOkosan/engine/initialState';
import { createPlaceholderGwentState } from '@shared/games/gwent/engine/initialState';
import { isFinished, isKnownGameType, KNOWN_GAME_TYPES } from './gameCompletion';

describe('isFinished — one generic check, shared by all five games', () => {
  it('a fresh initial state is never finished, for every game', () => {
    expect(isFinished(createHotelInitialState(['Alice', 'Bob']))).toBe(false);
    expect(isFinished(createRamsesInitialState(['Alice', 'Bob']))).toBe(false);
    expect(isFinished(createDamaInitialState())).toBe(false);
    expect(isFinished(createGazdalkodjOkosanInitialState(['Alice', 'Bob']))).toBe(false);
    expect(isFinished(createPlaceholderGwentState())).toBe(false);
  });

  it('a state with status FINISHED is finished, for every game', () => {
    expect(isFinished({ ...createHotelInitialState(['Alice', 'Bob']), status: 'FINISHED' })).toBe(true);
    expect(isFinished({ ...createRamsesInitialState(['Alice', 'Bob']), status: 'FINISHED' })).toBe(true);
    expect(isFinished({ ...createDamaInitialState(), status: 'FINISHED' })).toBe(true);
    expect(isFinished({ ...createGazdalkodjOkosanInitialState(['Alice', 'Bob']), status: 'FINISHED' })).toBe(true);
    expect(isFinished({ ...createPlaceholderGwentState(), status: 'FINISHED' })).toBe(true);
  });
});

describe('isKnownGameType / KNOWN_GAME_TYPES', () => {
  it('lists exactly the 5 real gameType strings, matching each Room subclass\'s own gameType field', () => {
    expect([...KNOWN_GAME_TYPES].sort()).toEqual(['dama', 'gazdalkodj-okosan', 'gwent', 'hotel', 'ramses'].sort());
  });

  it('accepts every known gameType and rejects anything else', () => {
    for (const gameType of KNOWN_GAME_TYPES) {
      expect(isKnownGameType(gameType)).toBe(true);
    }
    expect(isKnownGameType('not-a-real-game')).toBe(false);
    expect(isKnownGameType('gazdalkodjOkosan')).toBe(false); // the old, wrong (non-hyphenated) string — must NOT be accepted
  });
});
