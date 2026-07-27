import { getAdjacentCellIds, scoreOf } from './rules';
import type { Player, RamsesState } from './state';

export function getCurrentPlayer(state: RamsesState): Player {
  return state.players[state.currentPlayerIndex];
}

/** Cell ids the current player could legally slide right now — empty once the game is over. */
export function getSlidableCellIds(state: RamsesState): string[] {
  if (state.status !== 'IN_PROGRESS') return [];
  return getAdjacentCellIds(state.board, state.emptyCellId).filter(
    (id) => state.board.find((c) => c.id === id)!.hasPyramid,
  );
}

export interface PlayerScore {
  player: Player;
  score: number;
}

/** Highest score first — a natural scoreboard ordering for the UI. */
export function getScoreboard(state: RamsesState): PlayerScore[] {
  return state.players.map((player) => ({ player, score: scoreOf(player) })).sort((a, b) => b.score - a.score);
}

/** Only meaningful once the game is FINISHED — see rules.ts's computeWinnerIds (can be more than one, a genuine tie). */
export function getWinners(state: RamsesState): Player[] {
  return state.players.filter((player) => state.winnerIds.includes(player.id));
}
