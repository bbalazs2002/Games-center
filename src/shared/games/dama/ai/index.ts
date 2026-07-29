export { evaluateDamaState } from './heuristic';
export { findBestMoveFixedDepth, findBestMoveIterative } from './search';
export { pickRandomMove } from './randomMoveStrategy';
export { chooseDamaAiAction, isDamaAiDifficulty, type DamaAiDifficulty } from './strategy';

/**
 * Low MINIMUM "AI gondolkodik…" pacing — unlike Hotel/Ramses's fixed
 * per-move delay (their decision-making is effectively instant, so a
 * constant pause is added unconditionally), Dáma's MEDIUM/HARD search
 * already takes real, variable time on its own. The caller (DamaRoom,
 * useDamaHotSeatAi) measures the actual chooseDamaAiAction() wall-clock time
 * and only waits out the shortfall against this constant — if the search
 * already took this long or longer, nothing extra is added. See
 * docs/dama-0d-ai-specifikacio.md §9.3.
 */
export const DAMA_AI_MIN_THINK_DELAY_MS = 300;
