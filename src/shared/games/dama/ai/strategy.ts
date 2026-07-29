import type { DamaAction } from '../engine/actions';
import type { DamaState } from '../engine/state';
import { pickRandomMove } from './randomMoveStrategy';
import { findBestMoveFixedDepth, findBestMoveIterative } from './search';

export type DamaAiDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export function isDamaAiDifficulty(value: unknown): value is DamaAiDifficulty {
  return value === 'EASY' || value === 'MEDIUM' || value === 'HARD';
}

const MEDIUM_SEARCH_DEPTH = 4;
const HARD_MAX_SEARCH_DEPTH = 12;
const HARD_SEARCH_TIME_BUDGET_MS = 200;

/**
 * Single decision-making entry point shared by hot-seat AND online — see
 * docs/dama-0d-ai-specifikacio.md §1/§7. Always decides for `state.currentPlayer`
 * (unlike Hotel's chooseHotelAiAction, Dáma has no "act out of turn" exception,
 * so there's no separate `slot` parameter to pass — the caller is responsible
 * for only invoking this when it's actually an AI-controlled slot's turn).
 */
export function chooseDamaAiAction(state: DamaState, difficulty: DamaAiDifficulty): DamaAction | null {
  switch (difficulty) {
    case 'EASY':
      return pickRandomMove(state);
    case 'MEDIUM':
      return findBestMoveFixedDepth(state, MEDIUM_SEARCH_DEPTH);
    case 'HARD':
      return findBestMoveIterative(state, HARD_MAX_SEARCH_DEPTH, HARD_SEARCH_TIME_BUDGET_MS);
  }
}
