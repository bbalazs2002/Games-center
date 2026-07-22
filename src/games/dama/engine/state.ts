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

export type GameStatus = 'IN_PROGRESS' | 'LIGHT_WON' | 'DARK_WON' | 'DRAW';

export interface DamaState {
  board: Board;
  currentPlayer: Player;
  status: GameStatus;
  /** Set while a chain capture is in progress — only this piece may move next. */
  chainCaptureFrom: Position | null;
}
