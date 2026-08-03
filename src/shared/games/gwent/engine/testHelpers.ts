// Shared fixture builders for the Gwent engine's own test files (rules/reducer/selectors/leaderAbilities
// .test.ts) — not itself a test file, mirrors Hotel's inline `createInitialState(...) + updatePlayer(...)`
// idiom (see docs/hotel-0a-specifikacio.md) rather than introducing a new pattern.

import { createInitialState } from './initialState';
import type { CardInstance, GwentState, PlayerId } from './state';
import { createEmptyBoard } from './state';

/** A deliberately empty-deck 2-player match — every test injects exactly the hand/board/deck cards it needs via updatePlayer/updateBoardRow (rules.ts), so no test accidentally depends on real shuffle order. */
export function baseTestState(): GwentState {
  return createInitialState([
    { name: 'Alice', faction: 'Monsters', leaderId: 'test-leader-1', cardCounts: {} },
    { name: 'Bob', faction: 'Nilfgaard', leaderId: 'test-leader-2', cardCounts: {} },
  ]);
}

export function card(instanceId: string, defId: string): CardInstance {
  return { instanceId, defId, chosenRow: null };
}

export { createEmptyBoard };
export const PLAYER_1: PlayerId = 'player-1';
export const PLAYER_2: PlayerId = 'player-2';
