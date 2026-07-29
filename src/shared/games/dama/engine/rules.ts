import type { Board, DamaState, Piece, Player, Position } from './state';

const BOARD_SIZE = 8;

const DIAGONAL_DIRECTIONS: ReadonlyArray<{ dr: number; dc: number }> = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 1 },
];

export interface CaptureMove {
  to: Position;
  captured: Position;
}

export function isOnBoard(position: Position): boolean {
  return position.row >= 0 && position.row < BOARD_SIZE && position.col >= 0 && position.col < BOARD_SIZE;
}

export function isSamePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function getPieceAt(board: Board, position: Position): Piece | null {
  return board[position.row]?.[position.col] ?? null;
}

export function opponentOf(player: Player): Player {
  return player === 'LIGHT' ? 'DARK' : 'LIGHT';
}

export function isPromotionRow(player: Player, row: number): boolean {
  return player === 'LIGHT' ? row === 0 : row === BOARD_SIZE - 1;
}

function forwardDirectionsFor(player: Player): ReadonlyArray<{ dr: number; dc: number }> {
  const dr = player === 'LIGHT' ? -1 : 1;
  return [
    { dr, dc: -1 },
    { dr, dc: 1 },
  ];
}

/** Simple (non-capturing) moves for the piece standing on the given square. */
export function findSimpleMoves(state: DamaState, from: Position): Position[] {
  const piece = getPieceAt(state.board, from);
  if (!piece) return [];

  if (piece.type === 'MAN') {
    return forwardDirectionsFor(piece.player)
      .map(({ dr, dc }) => ({ row: from.row + dr, col: from.col + dc }))
      .filter((to) => isOnBoard(to) && getPieceAt(state.board, to) === null);
  }

  const moves: Position[] = [];
  for (const { dr, dc } of DIAGONAL_DIRECTIONS) {
    let step = 1;
    let to = { row: from.row + dr * step, col: from.col + dc * step };
    while (isOnBoard(to) && getPieceAt(state.board, to) === null) {
      moves.push(to);
      step += 1;
      to = { row: from.row + dr * step, col: from.col + dc * step };
    }
  }
  return moves;
}

function findManCaptureMoves(state: DamaState, from: Position, piece: Piece): CaptureMove[] {
  return DIAGONAL_DIRECTIONS.flatMap(({ dr, dc }) => {
    const captured = { row: from.row + dr, col: from.col + dc };
    const to = { row: from.row + dr * 2, col: from.col + dc * 2 };
    if (!isOnBoard(to) || getPieceAt(state.board, to) !== null) return [];

    const capturedPiece = getPieceAt(state.board, captured);
    if (!capturedPiece || capturedPiece.player === piece.player) return [];

    return [{ to, captured }];
  });
}

/** The first non-empty square along the diagonal starting at `from`, or null if it runs off the board. */
function findFirstObstacleAlongDiagonal(
  state: DamaState,
  from: Position,
  direction: { dr: number; dc: number },
): Position | null {
  let step = 1;
  let scan = { row: from.row + direction.dr * step, col: from.col + direction.dc * step };
  while (isOnBoard(scan) && getPieceAt(state.board, scan) === null) {
    step += 1;
    scan = { row: from.row + direction.dr * step, col: from.col + direction.dc * step };
  }
  return isOnBoard(scan) ? scan : null;
}

function findKingCaptureMovesInDirection(
  state: DamaState,
  from: Position,
  piece: Piece,
  direction: { dr: number; dc: number },
): CaptureMove[] {
  const enemyPosition = findFirstObstacleAlongDiagonal(state, from, direction);
  const enemyPiece = enemyPosition && getPieceAt(state.board, enemyPosition);
  if (!enemyPosition || !enemyPiece || enemyPiece.player === piece.player) return [];

  const moves: CaptureMove[] = [];
  let step = Math.max(Math.abs(enemyPosition.row - from.row), Math.abs(enemyPosition.col - from.col)) + 1;
  let landing = { row: from.row + direction.dr * step, col: from.col + direction.dc * step };
  while (isOnBoard(landing) && getPieceAt(state.board, landing) === null) {
    moves.push({ to: landing, captured: enemyPosition });
    step += 1;
    landing = { row: from.row + direction.dr * step, col: from.col + direction.dc * step };
  }
  return moves;
}

function findKingCaptureMoves(state: DamaState, from: Position, piece: Piece): CaptureMove[] {
  return DIAGONAL_DIRECTIONS.flatMap((direction) => findKingCaptureMovesInDirection(state, from, piece, direction));
}

/**
 * Single-hop capture options for the piece standing on the given square —
 * chain captures happen at the reducer level, through consecutive MOVE
 * actions (see docs/dama-0a-specifikacio.md §3.4-3.5), not here as a
 * pre-computed full sequence.
 */
export function findCaptureMoves(state: DamaState, from: Position): CaptureMove[] {
  const piece = getPieceAt(state.board, from);
  if (!piece) return [];

  return piece.type === 'MAN'
    ? findManCaptureMoves(state, from, piece)
    : findKingCaptureMoves(state, from, piece);
}

export function hasAnyCapture(state: DamaState, player: Player): boolean {
  return state.board.some((row, r) =>
    row.some(
      (piece, c) => piece?.player === player && findCaptureMoves(state, { row: r, col: c }).length > 0,
    ),
  );
}

export function hasAnyLegalMove(state: DamaState, player: Player): boolean {
  return state.board.some((row, r) =>
    row.some((piece, c) => {
      if (piece?.player !== player) return false;
      const position = { row: r, col: c };
      return findCaptureMoves(state, position).length > 0 || findSimpleMoves(state, position).length > 0;
    }),
  );
}
