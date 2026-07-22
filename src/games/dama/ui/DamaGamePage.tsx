import { useMemo, useState } from 'react';
import { LocalGameTransport } from '../../../core/transport/LocalGameTransport';
import { useGameTransport } from '../../../core/transport/useGameTransport';
import { GridBoard2D, type GridPosition } from '../../../renderers/grid-2d/GridBoard2D';
import type { DamaAction } from '../engine/actions';
import { createInitialState } from '../engine/initialState';
import { reducer } from '../engine/reducer';
import { getMovablePositions, getValidMoves, getWinner } from '../engine/selectors';
import type { DamaState, Piece, Player } from '../engine/state';
import styles from './DamaGamePage.module.css';

// Fázis 1: hot-seat only — mindkét oldal ember, közvetlen UI-kattintásból dispatch-elve.
// A core/controller/HumanController ide kötése (docs/fazis-0a-dama-specifikacio.md §6) csak
// akkor válik szükségessé, ha egy AIController is megjelenik ugyanabban a munkamenetben.
const PLAYER_LABEL: Record<Player, string> = { LIGHT: 'Világos', DARK: 'Sötét' };

function renderPiece(piece: Piece) {
  const pieceClass = piece.player === 'LIGHT' ? styles.lightPiece : styles.darkPiece;
  return <div className={[styles.piece, pieceClass].join(' ')}>{piece.type === 'KING' ? '♛' : '●'}</div>;
}

export function DamaGamePage() {
  const transport = useMemo(() => new LocalGameTransport<DamaState, DamaAction>(reducer, createInitialState()), []);
  const [state, dispatch] = useGameTransport(transport);
  const [selected, setSelected] = useState<GridPosition | null>(null);

  const winner = getWinner(state);
  const effectiveSelected = state.chainCaptureFrom ?? selected;
  const validMoves = effectiveSelected ? getValidMoves(state, effectiveSelected) : [];
  // Amíg nincs kiválasztott bábu, a kör elején a léphető bábuk mezőit emeljük ki;
  // kiválasztás után ugyanez a highlight a célmezőkre vált. Játék végén nincs highlight.
  const highlightedSquares = winner ? [] : effectiveSelected ? validMoves : getMovablePositions(state);

  function handleSquareClick(position: GridPosition) {
    if (winner) return;

    const isValidTarget = validMoves.some((move) => move.row === position.row && move.col === position.col);
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
      <p className={styles.notice}>
        {winner ? `Győztes: ${PLAYER_LABEL[winner]}` : `Soron van: ${PLAYER_LABEL[state.currentPlayer]}`}
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
