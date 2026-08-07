import { useMemo, useState } from 'react';
import type { GameTransport } from '../../../core/transport/GameTransport';
import { LocalGameTransport } from '../../../core/transport/LocalGameTransport';
import { useGameTransport } from '../../../core/transport/useGameTransport';
import { useLocalGameLogger } from '../../../core/transport/useLocalGameLogger';
import { useReportFeedbackContext } from '../../../ui-kit/useFeedbackContext';
import { LocalGameControls } from '../../../ui-kit/LocalGameControls';
import { GridBoard2D, type GridPosition } from '../../../renderers/grid-2d/GridBoard2D';
import theme from '../../../renderers/grid-2d/clusterBTheme.module.css';
import type { DamaAction } from '@shared/games/dama/engine/actions';
import { createInitialState } from '@shared/games/dama/engine/initialState';
import { reducer } from '@shared/games/dama/engine/reducer';
import {
  getMovablePositions,
  getValidMoves,
  getWinner,
} from '@shared/games/dama/engine/selectors';
import type { DamaState, Piece, Player } from '@shared/games/dama/engine/state';
import { useDamaHotSeatAi, type HotSeatAiSlots } from './useDamaHotSeatAi';
import styles from './DamaGamePage.module.css';

const PLAYER_LABEL: Record<Player, string> = { LIGHT: 'Világos', DARK: 'Sötét' };

function renderPiece(piece: Piece) {
  const pieceClass = piece.player === 'LIGHT' ? styles.lightPiece : styles.darkPiece;
  return (
    <div className={[styles.piece, pieceClass].join(' ')}>
      {piece.type === 'KING' && <span className={styles.kingRing} />}
    </div>
  );
}

/** Piece counts per side, derived straight from the board — no engine change needed, just a display concern. */
function countPieces(state: DamaState): Record<Player, number> {
  const counts: Record<Player, number> = { LIGHT: 0, DARK: 0 };
  state.board.forEach((row) =>
    row.forEach((piece) => {
      if (piece) counts[piece.player] += 1;
    }),
  );
  return counts;
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
  isCurrentPlayerAi: boolean,
  effectiveSelected: GridPosition | null,
): GridPosition[] {
  if (!isMyTurn || isCurrentPlayerAi || !effectiveSelected) return [];
  return getValidMoves(state, effectiveSelected);
}

// Before a piece is selected, highlight the squares that have a movable piece at
// the start of the turn; after selection, the same highlight switches to the
// target squares. No highlight once the game has ended, it's not this player's
// turn, or (hot-seat only) an AI-controlled slot's turn is being decided.
function computeHighlightedSquares(
  state: DamaState,
  winner: Player | null,
  isMyTurn: boolean,
  isCurrentPlayerAi: boolean,
  effectiveSelected: GridPosition | null,
  validMoves: GridPosition[],
): GridPosition[] {
  if (winner || !isMyTurn || isCurrentPlayerAi) return [];
  if (effectiveSelected) return validMoves;
  return getMovablePositions(state);
}

/** " — te" for the local online player, " — AI" for a hot-seat AI-controlled slot, nothing otherwise. */
function playerRoleLabel(player: Player, myPlayer: Player | undefined, hotSeatAiSlots: HotSeatAiSlots): string {
  if (myPlayer) return player === myPlayer ? ' — te' : '';
  return hotSeatAiSlots[player] !== undefined ? ' — AI' : '';
}

function turnReadoutText(winner: Player | null, currentPlayer: Player, isCurrentPlayerAi: boolean): string {
  if (winner) return `Győztes: ${PLAYER_LABEL[winner]}`;
  const aiSuffix = isCurrentPlayerAi ? ' (AI gondolkodik…)' : '';
  return `Soron van: ${PLAYER_LABEL[currentPlayer]}${aiSuffix}`;
}

function ScoreCard({
  state,
  winner,
  myPlayer,
  hotSeatAiSlots,
}: {
  state: DamaState;
  winner: Player | null;
  myPlayer?: Player;
  hotSeatAiSlots: HotSeatAiSlots;
}) {
  const counts = countPieces(state);
  const players: Player[] = ['LIGHT', 'DARK'];
  return (
    <div className={styles.card}>
      <h3>Állás</h3>
      {players.map((player) => {
        const isCurrent = !winner && state.currentPlayer === player;
        return (
          <div key={player} className={[styles.scoreline, isCurrent ? styles.current : ''].join(' ')}>
            <span className={styles.who}>
              <span className={[styles.swatch, player === 'LIGHT' ? styles.lightPiece : styles.darkPiece].join(' ')} />
              {PLAYER_LABEL[player]}
              {playerRoleLabel(player, myPlayer, hotSeatAiSlots)}
            </span>
            <span className={styles.tally}>{counts[player]} bábu</span>
          </div>
        );
      })}
    </div>
  );
}

export interface DamaGamePageProps {
  /** If omitted, a local LocalGameTransport is created for hot-seat mode — see docs/dama-0b-multiplayer-specifikacio.md §6.2. */
  transport?: GameTransport<DamaState, DamaAction>;
  /** Online mode only: which side the local player controls — shown alongside the turn indicator. */
  myPlayer?: Player;
  /** Hot-seat only — which of the two LIGHT/DARK slots (if any) is AI-controlled, and at what difficulty. Ignored once `transport` is provided, since online AI is already driven server-side by GameRoom. */
  hotSeatAiSlots?: HotSeatAiSlots;
  /** Local mode only — lets the player abandon the current local game and return to DamaSetupPage's form. Omitted (no "Új játék" affordance shown) in online mode. */
  onRequestNewGame?: () => void;
}

export function DamaGamePage({
  transport: providedTransport,
  myPlayer,
  hotSeatAiSlots,
  onRequestNewGame,
}: DamaGamePageProps = {}) {
  const isLocalMode = providedTransport === undefined;
  const localTransport = useMemo(
    () => new LocalGameTransport<DamaState, DamaAction>(reducer, createInitialState()),
    [],
  );
  const loggedLocalTransport = useLocalGameLogger(localTransport, 'dama');
  const transport = providedTransport ?? loggedLocalTransport;
  const [state, dispatch] = useGameTransport(transport);
  const effectiveHotSeatAiSlots = hotSeatAiSlots ?? {};
  useDamaHotSeatAi(transport, effectiveHotSeatAiSlots);
  useReportFeedbackContext('dama', state);
  const [selected, setSelected] = useState<GridPosition | null>(null);

  const winner = getWinner(state);
  const isMyTurn = isPlayersTurnToAct(state, myPlayer);
  // Hot-seat only (hotSeatAiSlots is empty in online mode) — the board simply
  // doesn't react while an AI-controlled slot's turn is being decided/applied,
  // same "no reaction, no extra message" principle as the online !isMyTurn gate.
  const isCurrentPlayerAi = effectiveHotSeatAiSlots[state.currentPlayer] !== undefined;
  const effectiveSelected = state.chainCaptureFrom ?? selected;
  const validMoves = computeValidMoves(state, isMyTurn, isCurrentPlayerAi, effectiveSelected);
  const highlightedSquares = computeHighlightedSquares(
    state,
    winner,
    isMyTurn,
    isCurrentPlayerAi,
    effectiveSelected,
    validMoves,
  );

  function handleSquareClick(position: GridPosition) {
    if (winner || !isMyTurn || isCurrentPlayerAi) return;

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
    <div className={[styles.page, theme.theme].join(' ')}>
      <div className={styles.tableLayout}>
        <div className={styles.boardPanel}>
          <div className={styles.boardPanelHead}>
            <h1>Dáma</h1>
            <p className={styles.turnReadout}>
              <span className={[styles.turnDot, state.currentPlayer === 'LIGHT' ? styles.lightPiece : styles.darkPiece].join(' ')} />
              {turnReadoutText(winner, state.currentPlayer, isCurrentPlayerAi)}
            </p>
          </div>
          <GridBoard2D<Piece>
            rows={8}
            cols={8}
            getPieceAt={(position) => state.board[position.row][position.col]}
            renderPiece={renderPiece}
            highlightedSquares={highlightedSquares}
            onSquareClick={handleSquareClick}
            showCoordinates
          />
        </div>
        <div className={styles.rail}>
          <ScoreCard state={state} winner={winner} myPlayer={myPlayer} hotSeatAiSlots={effectiveHotSeatAiSlots} />
        </div>
      </div>
      {isLocalMode && <LocalGameControls gameId="dama" onRequestNewGame={onRequestNewGame} resumable={false} />}
    </div>
  );
}

export default DamaGamePage;
