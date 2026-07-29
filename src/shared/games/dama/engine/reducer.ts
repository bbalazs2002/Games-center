import type { DamaAction } from './actions';
import type { Board, DamaState, MoveLogEntry, Piece, Position } from './state';
import {
  findCaptureMoves,
  findSimpleMoves,
  getPieceAt,
  hasAnyCapture,
  hasAnyLegalMove,
  isPromotionRow,
  isSamePosition,
  opponentOf,
  type CaptureMove,
} from './rules';

function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

function appendLog(log: MoveLogEntry[], entry: MoveLogEntry): MoveLogEntry[] {
  return [...log, entry];
}

function withWinCheck(state: DamaState): DamaState {
  if (hasAnyLegalMove(state, state.currentPlayer)) return state;
  const winner = opponentOf(state.currentPlayer);
  return { ...state, status: winner === 'LIGHT' ? 'LIGHT_WON' : 'DARK_WON' };
}

function applySimpleMove(state: DamaState, from: Position, to: Position): DamaState {
  const board = cloneBoard(state.board);
  const piece = board[from.row][from.col] as Piece;
  board[from.row][from.col] = null;

  const promotes = piece.type === 'MAN' && isPromotionRow(piece.player, to.row);
  board[to.row][to.col] = promotes ? { ...piece, type: 'KING' } : piece;

  return withWinCheck({
    board,
    currentPlayer: opponentOf(state.currentPlayer),
    status: 'IN_PROGRESS',
    chainCaptureFrom: null,
    log: appendLog(state.log, { player: piece.player, from, to, captured: null, becameKing: promotes }),
  });
}

/**
 * Simplification (2026-07-22, not unambiguously specified in spec §3.4): if a
 * piece reaches the promotion row mid-chain-capture, the move ends there —
 * the freshly-crowned king does NOT continue capturing in the same turn, the
 * turn passes. A deliberately documented rule choice; other Dáma variants
 * handle this differently.
 */
function applyCapture(state: DamaState, from: Position, move: CaptureMove): DamaState {
  const board = cloneBoard(state.board);
  const piece = board[from.row][from.col] as Piece;
  board[from.row][from.col] = null;
  board[move.captured.row][move.captured.col] = null;

  const promotes = piece.type === 'MAN' && isPromotionRow(piece.player, move.to.row);
  board[move.to.row][move.to.col] = promotes ? { ...piece, type: 'KING' } : piece;
  const log = appendLog(state.log, {
    player: piece.player,
    from,
    to: move.to,
    captured: move.captured,
    becameKing: promotes,
  });

  if (promotes) {
    return withWinCheck({
      board,
      currentPlayer: opponentOf(state.currentPlayer),
      status: 'IN_PROGRESS',
      chainCaptureFrom: null,
      log,
    });
  }

  const chainState: DamaState = {
    board,
    currentPlayer: state.currentPlayer,
    status: 'IN_PROGRESS',
    chainCaptureFrom: move.to,
    log,
  };

  if (findCaptureMoves(chainState, move.to).length > 0) {
    return chainState;
  }

  return withWinCheck({
    ...chainState,
    currentPlayer: opponentOf(state.currentPlayer),
    chainCaptureFrom: null,
  });
}

export function reducer(state: DamaState, action: DamaAction): DamaState {
  if (state.status !== 'IN_PROGRESS') return state;

  const piece = getPieceAt(state.board, action.from);
  if (!piece || piece.player !== state.currentPlayer) return state;
  if (state.chainCaptureFrom && !isSamePosition(state.chainCaptureFrom, action.from)) return state;

  const captureMove = findCaptureMoves(state, action.from).find((move) => isSamePosition(move.to, action.to));
  if (captureMove) {
    return applyCapture(state, action.from, captureMove);
  }

  if (hasAnyCapture(state, state.currentPlayer)) {
    return state;
  }

  const isLegalSimpleMove = findSimpleMoves(state, action.from).some((to) => isSamePosition(to, action.to));
  if (!isLegalSimpleMove) return state;

  return applySimpleMove(state, action.from, action.to);
}
