export type Player = 'LIGHT' | 'DARK';
export type PieceType = 'MAN' | 'KING';

export interface Piece {
  player: Player;
  type: PieceType;
}

export interface Position {
  row: number;
  col: number;
}

export type Board = (Piece | null)[][];

/**
 * Lifecycle only — deliberately mirrors the same field on every other
 * game's state, so "is this game over" can be checked uniformly across all
 * five games without knowing each one's own state shape (see
 * src/shared/core/gameCompletion.ts). The specific result lives in
 * `DamaState.outcome` instead, which used to be folded into this type
 * before the split (`'LIGHT_WON' | 'DARK_WON' | 'DRAW'` used to BE the
 * terminal values here).
 */
export type GameStatus = 'IN_PROGRESS' | 'FINISHED';

/** Only set once `status === 'FINISHED'` — the specific result, split out from GameStatus so that field can stay uniform across games. */
export type GameOutcome = 'LIGHT_WON' | 'DARK_WON' | 'DRAW';

/**
 * One applied MOVE action's outcome — added purely as context for the
 * shell-level feedback reporter (see docs/shell-ux-specifikacio.md §4.2.1),
 * not for any in-game UI. A chain capture appends one entry PER hop, same as
 * the underlying MOVE actions themselves are one per hop.
 */
export interface MoveLogEntry {
  player: Player;
  from: Position;
  to: Position;
  captured: Position | null;
  becameKing: boolean;
}

export interface DamaState {
  board: Board;
  currentPlayer: Player;
  status: GameStatus;
  /** Null until `status === 'FINISHED'`. */
  outcome: GameOutcome | null;
  /** Set while a chain capture is in progress — only this piece may move next. */
  chainCaptureFrom: Position | null;
  /** Append-only event history — see MoveLogEntry. */
  log: MoveLogEntry[];
}
