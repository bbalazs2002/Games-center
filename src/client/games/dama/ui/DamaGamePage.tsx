import { useMemo, useState } from 'react';
import type { GameTransport } from '../../../core/transport/GameTransport';
import { LocalGameTransport } from '../../../core/transport/LocalGameTransport';
import { useGameTransport } from '../../../core/transport/useGameTransport';
import { GridBoard2D, type GridPosition } from '../../../renderers/grid-2d/GridBoard2D';
import type { DamaAction } from '../../../../shared/games/dama/engine/actions';
import { createInitialState } from '../../../../shared/games/dama/engine/initialState';
import { reducer } from '../../../../shared/games/dama/engine/reducer';
import {
  getMovablePositions,
  getValidMoves,
  getWinner,
} from '../../../../shared/games/dama/engine/selectors';
import type { DamaState, Piece, Player } from '../../../../shared/games/dama/engine/state';
import styles from './DamaGamePage.module.css';

// Phase 1: hot-seat only — both sides are human, dispatched directly from UI clicks.
// Wiring core/controller/HumanController in here (docs/fazis-0a-dama-specifikacio.md §6)
// only becomes necessary once an AIController shows up in the same session.
const PLAYER_LABEL: Record<Player, string> = { LIGHT: 'Világos', DARK: 'Sötét' };

function renderPiece(piece: Piece) {
  const pieceClass = piece.player === 'LIGHT' ? styles.lightPiece : styles.darkPiece;
  return (
    <div className={[styles.piece, pieceClass].join(' ')}>{piece.type === 'KING' ? '♛' : '●'}</div>
  );
}

// Online mode only: while it's the opponent's turn, this player shouldn't see any
// highlighting or be able to select pieces (including the opponent's) — hot-seat
// mode has no myPlayer, so it's always "my turn" there since both sides share
// the same screen.
function isPlayersTurnToAct(state: DamaState, myPlayer?: Player): boolean {
  return !myPlayer || myPlayer === state.currentPlayer;
}

function computeValidMoves(
  state: DamaState,
  isMyTurn: boolean,
  effectiveSelected: GridPosition | null,
): GridPosition[] {
  if (!isMyTurn || !effectiveSelected) return [];
  return getValidMoves(state, effectiveSelected);
}

// Before a piece is selected, highlight the squares that have a movable piece at
// the start of the turn; after selection, the same highlight switches to the
// target squares. No highlight once the game has ended or it's not this
// player's turn.
function computeHighlightedSquares(
  state: DamaState,
  winner: Player | null,
  isMyTurn: boolean,
  effectiveSelected: GridPosition | null,
  validMoves: GridPosition[],
): GridPosition[] {
  if (winner || !isMyTurn) return [];
  if (effectiveSelected) return validMoves;
  return getMovablePositions(state);
}

export interface DamaGamePageProps {
  /** If omitted, a local LocalGameTransport is created for hot-seat mode — see docs/fazis-0b-multiplayer-specifikacio.md §6.2. */
  transport?: GameTransport<DamaState, DamaAction>;
  /** Online mode only: which side the local player controls — shown alongside the turn indicator. */
  myPlayer?: Player;
}

export function DamaGamePage({ transport: providedTransport, myPlayer }: DamaGamePageProps = {}) {
  const localTransport = useMemo(
    () => new LocalGameTransport<DamaState, DamaAction>(reducer, createInitialState()),
    [],
  );
  const transport = providedTransport ?? localTransport;
  const [state, dispatch] = useGameTransport(transport);
  const [selected, setSelected] = useState<GridPosition | null>(null);

  const winner = getWinner(state);
  const isMyTurn = isPlayersTurnToAct(state, myPlayer);
  const effectiveSelected = state.chainCaptureFrom ?? selected;
  const validMoves = computeValidMoves(state, isMyTurn, effectiveSelected);
  const highlightedSquares = computeHighlightedSquares(
    state,
    winner,
    isMyTurn,
    effectiveSelected,
    validMoves,
  );

  function handleSquareClick(position: GridPosition) {
    if (winner || !isMyTurn) return;

    const isValidTarget = validMoves.some(
      (move) => move.row === position.row && move.col === position.col,
    );
    if (effectiveSelected && isValidTarget) {
      dispatch({ type: 'MOVE', from: effectiveSelected, to: position });
      setSelected(null);
      return;
    }

    const piece = state.board[position.row][position.col];
    const canSelect = piece && piece.player === state.currentPlayer && !state.chainCaptureFrom;
    setSelected(canSelect ? position : null);
  }

  return (
    <div className={styles.page}>
      <h1>Dáma</h1>
      {myPlayer && <p className={styles.notice}>Te vagy: {PLAYER_LABEL[myPlayer]}</p>}
      <p className={styles.notice}>
        {winner
          ? `Győztes: ${PLAYER_LABEL[winner]}`
          : `Soron van: ${PLAYER_LABEL[state.currentPlayer]}`}
      </p>
      <GridBoard2D<Piece>
        rows={8}
        cols={8}
        getPieceAt={(position) => state.board[position.row][position.col]}
        renderPiece={renderPiece}
        highlightedSquares={highlightedSquares}
        onSquareClick={handleSquareClick}
      />
    </div>
  );
}

export default DamaGamePage;
