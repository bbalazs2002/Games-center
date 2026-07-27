import type { Player, PlayerId, RamsesCell, RamsesState } from './state';

/** Confirmed by the user against the physical board — see docs/ramses-0a-specifikacio.md §4. */
export const BOARD_ROWS = 6;
export const BOARD_COLS = 8;

const ADJACENT_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function getCell(board: RamsesCell[], cellId: string): RamsesCell {
  const cell = board.find((c) => c.id === cellId);
  if (!cell) throw new Error(`Unknown cell: ${cellId}`);
  return cell;
}

/** Orthogonal (4-directional) neighbors only — no diagonals, see docs/ramses-0a-specifikacio.md §4. */
export function getAdjacentCellIds(board: RamsesCell[], cellId: string): string[] {
  const { row, col } = getCell(board, cellId);
  return ADJACENT_DELTAS.map(([dr, dc]) => board.find((c) => c.row === row + dr && c.col === col + dc))
    .filter((c): c is RamsesCell => c !== undefined)
    .map((c) => c.id);
}

export function canSlidePyramid(state: RamsesState, fromCellId: string): boolean {
  if (state.status !== 'IN_PROGRESS') return false;
  const cell = state.board.find((c) => c.id === fromCellId);
  if (!cell || !cell.hasPyramid) return false;
  return getAdjacentCellIds(state.board, state.emptyCellId).includes(fromCellId);
}

export function nextPlayerIndex(state: RamsesState): number {
  return (state.currentPlayerIndex + 1) % state.players.length;
}

export function scoreOf(player: Player): number {
  return player.wonCards.reduce((sum, card) => sum + card.points, 0);
}

/** Highest score wins; ties broken by most cards won; a still-remaining tie means everyone involved co-wins (see docs/ramses-0a-specifikacio.md §2.4). */
export function computeWinnerIds(players: Player[]): PlayerId[] {
  const maxScore = Math.max(...players.map(scoreOf));
  const topByScore = players.filter((p) => scoreOf(p) === maxScore);
  if (topByScore.length === 1) return [topByScore[0].id];

  const maxCards = Math.max(...topByScore.map((p) => p.wonCards.length));
  return topByScore.filter((p) => p.wonCards.length === maxCards).map((p) => p.id);
}

/**
 * Awards the current `activeCard` to the current player (caller's
 * responsibility to ensure one is actually set) and ends the game if that
 * was the last card in the draw pile.
 */
export function awardActiveCardToCurrentPlayer(state: RamsesState): RamsesState {
  const card = state.activeCard as SearchCardNonNull;
  const players = state.players.map((player, index) =>
    index === state.currentPlayerIndex ? { ...player, wonCards: [...player.wonCards, card] } : player,
  );
  const next: RamsesState = { ...state, players, activeCard: null };

  if (next.drawPile.length === 0) {
    return { ...next, status: 'FINISHED', winnerIds: computeWinnerIds(next.players) };
  }
  return next;
}

// Local alias purely so the cast above reads as "the invariant guarantees
// this", not an unchecked `!` with no explanation — see state.ts's
// `activeCard` doc comment for the actual invariant.
type SearchCardNonNull = NonNullable<RamsesState['activeCard']>;

/**
 * Draws the top of the pile for the CURRENT player — per the user's house
 * rule (docs/ramses-0a-specifikacio.md §2.3), a successful find never passes
 * the turn, so it's always the same player drawing again, never "the next
 * one". If the freshly drawn card's treasure happens to already be showing
 * at the empty cell (the "szerencsés eset"), it's an immediate, move-less
 * win — recurses to draw again for the same player, potentially chaining
 * several times in a row.
 */
export function drawCardForCurrentPlayer(state: RamsesState): RamsesState {
  const [card, ...rest] = state.drawPile;
  const emptyCell = getCell(state.board, state.emptyCellId);
  const next: RamsesState = { ...state, drawPile: rest, activeCard: card };

  if (emptyCell.treasureId !== null && emptyCell.treasureId === card.treasureId) {
    const awarded = awardActiveCardToCurrentPlayer(next);
    return awarded.status === 'FINISHED' ? awarded : drawCardForCurrentPlayer(awarded);
  }
  return next;
}
