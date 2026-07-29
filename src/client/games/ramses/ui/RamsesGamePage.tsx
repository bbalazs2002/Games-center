import { useMemo, useRef } from 'react';
import type { GameTransport } from '../../../core/transport/GameTransport';
import { LocalGameTransport } from '../../../core/transport/LocalGameTransport';
import { useGameTransport } from '../../../core/transport/useGameTransport';
import { useLocalGameLogger } from '../../../core/transport/useLocalGameLogger';
import { Button } from '../../../ui-kit/Button';
import { useReportFeedbackContext } from '../../../ui-kit/FeedbackContext';
import { LocalGameControls } from '../../../ui-kit/LocalGameControls';
import { GridBoard3D, type GridBoard3DCell } from '../../../renderers/grid-3d/GridBoard3D';
import { MaskedRamsesTransport } from './MaskedRamsesTransport';
import { useRamsesHotSeatAi, type HotSeatAiSlots } from './useRamsesHotSeatAi';
import type { RamsesAction } from '../../../../shared/games/ramses/engine/actions';
import { createInitialState } from '../../../../shared/games/ramses/engine/initialState';
import { reducer } from '../../../../shared/games/ramses/engine/reducer';
import { BOARD_COLS, BOARD_ROWS } from '../../../../shared/games/ramses/engine/rules';
import {
  getCurrentPlayer,
  getDrawPileCount,
  getScoreboard,
  getSlidableCellIds,
  getWinners,
  type PlayerScore,
} from '../../../../shared/games/ramses/engine/selectors';
import type { Player, PlayerId, RamsesCell, RamsesState } from '../../../../shared/games/ramses/engine/state';
import { getTreasureConfig } from '../../../../shared/games/ramses/engine/treasureConfigs';
import styles from './RamsesGamePage.module.css';

// Purely decorative — pyramid color has no rule meaning in the base game
// (see docs/ramses-0a-specifikacio.md §2.1), just visual variety like the
// physical set's 16 gold/16 red/15 blue pieces.
const PYRAMID_COLORS = ['#d4a017', '#b23a48', '#3d5a80'];
const BOARD_COLOR = '#5c4a35';

interface RamsesCellViewData extends RamsesCell {
  pyramidColor: string;
}

/**
 * Assigns each individual pyramid piece a color once (by a stable ID, not by
 * its current cell) and keeps it for the rest of the game as it slides
 * around — otherwise position-based coloring makes a piece appear to change
 * color every time it moves, which reads as a bug. Exactly one pyramid moves
 * per SLIDE_PYRAMID (from the new emptyCellId to the previous one), so a
 * single-step diff against the last-seen emptyCellId is enough to track it;
 * this is purely a rendering concern and deliberately kept out of engine
 * state (see docs/ramses-0a-specifikacio.md §2.1/§5.1).
 */
function usePersistentPyramidColors(state: RamsesState): Map<string, string> {
  const pieceIdByCellRef = useRef<Map<string, string> | null>(null);
  const colorByPieceIdRef = useRef<Map<string, string>>(new Map());
  const lastEmptyCellIdRef = useRef<string | null>(null);

  if (pieceIdByCellRef.current === null) {
    const pieceIdByCell = new Map<string, string>();
    let pieceIndex = 0;
    for (const cell of state.board) {
      if (cell.hasPyramid) {
        const pieceId = `pyramid-${pieceIndex}`;
        pieceIdByCell.set(cell.id, pieceId);
        colorByPieceIdRef.current.set(pieceId, PYRAMID_COLORS[pieceIndex % PYRAMID_COLORS.length]);
        pieceIndex += 1;
      }
    }
    pieceIdByCellRef.current = pieceIdByCell;
    lastEmptyCellIdRef.current = state.emptyCellId;
  } else if (lastEmptyCellIdRef.current !== state.emptyCellId) {
    const pieceIdByCell = pieceIdByCellRef.current;
    const movedPieceId = pieceIdByCell.get(state.emptyCellId);
    if (movedPieceId) {
      pieceIdByCell.delete(state.emptyCellId);
      // Non-null: this branch only runs after initialization, which always sets it to a real cell id.
      pieceIdByCell.set(lastEmptyCellIdRef.current!, movedPieceId);
    }
    lastEmptyCellIdRef.current = state.emptyCellId;
  }

  const colorByCellId = new Map<string, string>();
  for (const [cellId, pieceId] of pieceIdByCellRef.current) {
    const color = colorByPieceIdRef.current.get(pieceId);
    if (color) colorByCellId.set(cellId, color);
  }
  return colorByCellId;
}

/** Placeholder geometry (cone = pyramid, flat plane = revealed treasure/blank) — real assets are a later round, see docs/ramses-0a-specifikacio.md §5.1. */
function renderCell(cell: RamsesCellViewData) {
  if (cell.hasPyramid) {
    return (
      <mesh position={[0, 0.35, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.45, 0.7, 4]} />
        <meshStandardMaterial color={cell.pyramidColor} />
      </mesh>
    );
  }

  const treasure = cell.treasureId ? getTreasureConfig(cell.treasureId) : null;
  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.9, 0.9]} />
      <meshStandardMaterial color={treasure ? treasure.color : '#2b2b2b'} />
    </mesh>
  );
}

function ScoreboardList({ scoreboard }: { scoreboard: PlayerScore[] }) {
  return (
    <ul className={styles.scoreboard}>
      {scoreboard.map(({ player, score }) => (
        <li key={player.id}>
          {player.name}: {score} pont ({player.wonCards.length} lap)
        </li>
      ))}
    </ul>
  );
}

/** Split out of RamsesGamePage purely to stay under this codebase's eslint complexity limit — same established pattern as prior complexity fixes elsewhere (see project memory). */
function RamsesWinnerScreen({
  winners,
  scoreboard,
  showNewGameButton,
  onRequestNewGame,
}: {
  winners: Player[];
  scoreboard: PlayerScore[];
  showNewGameButton: boolean;
  onRequestNewGame?: () => void;
}) {
  return (
    <div className={styles.page}>
      <h1>Vége a játéknak!</h1>
      <p>
        {winners.length > 1
          ? `Holtverseny: ${winners.map((w) => w.name).join(', ')}`
          : `Győztes: ${winners[0]?.name}`}
      </p>
      <ScoreboardList scoreboard={scoreboard} />
      {showNewGameButton && onRequestNewGame && <Button onClick={onRequestNewGame}>Új játék</Button>}
    </div>
  );
}

export interface RamsesGamePageProps {
  /** Hot-seat only — ignored (a throwaway LocalGameTransport is still built but never used) once `transport` is provided. */
  playerNames?: string[];
  /** If omitted, a local LocalGameTransport is created for hot-seat mode — see docs/ramses-0b-specifikacio.md §3.6. */
  transport?: GameTransport<RamsesState, RamsesAction>;
  /** Online mode only: which player slot the local client controls — gates board interactivity to "only on your turn". */
  myPlayer?: PlayerId;
  /** Hot-seat only — which of THIS game's player slots (if any) are AI-controlled, and at what difficulty. Ignored once `transport` is provided, since online AI is already driven server-side by GameRoom. */
  hotSeatAiSlots?: HotSeatAiSlots;
  /** Local mode only — lets the player abandon the current local game and return to RamsesSetupPage's form. Omitted (no "Új játék" affordance shown) in online mode. */
  onRequestNewGame?: () => void;
}

/**
 * Ramses-0a hot-seat vertical, generalized for Ramses-0b online play and
 * Ramses-0c AI opponents — mirrors HotelGamePage's role: wires the shared
 * reducer to a transport (local or networked) and renders it via GridBoard3D
 * (see docs/ramses-0a-specifikacio.md §5, docs/ramses-0b-specifikacio.md §3.6).
 * Unlike Hotel, the board itself IS the only interaction surface — no
 * separate action menu, since the engine only has one action type
 * (SLIDE_PYRAMID).
 */
export function RamsesGamePage({
  playerNames,
  transport: providedTransport,
  myPlayer,
  hotSeatAiSlots,
  onRequestNewGame,
}: RamsesGamePageProps) {
  const isLocalMode = providedTransport === undefined;
  const localTransport = useMemo(
    () => new LocalGameTransport<RamsesState, RamsesAction>(reducer, createInitialState(playerNames ?? [])),
    [playerNames],
  );
  // Logs the TRUE (unmasked) state, deliberately wrapped before masking below
  // — see LoggingGameTransport.ts. Only ever feeds into the `providedTransport
  // ?? ...` fallback, so online play (which supplies its own transport) is
  // unaffected, same as localTransport itself already was.
  const loggedLocalTransport = useLocalGameLogger(localTransport, 'ramses');
  // Always wrapped — see docs/ramses-0c-ai-specifikacio.md §3.2: no consumer
  // (rendering OR the hot-seat AI hook below) ever sees the true state,
  // structurally, regardless of hot-seat or online mode.
  const transport = useMemo(
    () => new MaskedRamsesTransport(providedTransport ?? loggedLocalTransport),
    [providedTransport, loggedLocalTransport],
  );
  const [state, dispatch] = useGameTransport(transport);
  useRamsesHotSeatAi(transport, hotSeatAiSlots ?? {});
  // `state` here is already MaskedRamsesTransport's output (masked) — safe to
  // publish as-is, same guarantee the rest of this page already relies on.
  useReportFeedbackContext('ramses', state);
  const pyramidColors = usePersistentPyramidColors(state);

  const winners = getWinners(state);
  const scoreboard = getScoreboard(state);

  if (state.status === 'FINISHED') {
    return (
      <RamsesWinnerScreen
        winners={winners}
        scoreboard={scoreboard}
        showNewGameButton={isLocalMode}
        onRequestNewGame={onRequestNewGame}
      />
    );
  }

  const currentPlayer = getCurrentPlayer(state);
  const slidableCellIds = getSlidableCellIds(state);
  const activeTreasure = state.activeCard ? getTreasureConfig(state.activeCard.treasureId) : null;
  const drawPileCount = getDrawPileCount(state);
  // Online only (myPlayer is undefined in hot-seat, where it's always "your" turn locally).
  const isMyTurn = !myPlayer || myPlayer === currentPlayer.id;
  // Hot-seat only (hotSeatAiSlots is empty in online mode) — the board simply
  // doesn't react while an AI-controlled slot's turn is being decided/applied,
  // same "no reaction, no extra message" principle as the online !isMyTurn gate.
  const isCurrentPlayerAi = (hotSeatAiSlots ?? {})[currentPlayer.id] !== undefined;

  const cells: GridBoard3DCell<RamsesCellViewData>[] = state.board.map((cell) => ({
    id: cell.id,
    row: cell.row,
    col: cell.col,
    data: { ...cell, pyramidColor: pyramidColors.get(cell.id) ?? PYRAMID_COLORS[0] },
  }));

  function handleCellClick(cellId: string): void {
    if (!isMyTurn || isCurrentPlayerAi || !slidableCellIds.includes(cellId)) return;
    dispatch({ type: 'SLIDE_PYRAMID', fromCellId: cellId });
  }

  return (
    <div className={styles.page}>
      <div className={styles.canvasWrapper}>
        <GridBoard3D
          rows={BOARD_ROWS}
          cols={BOARD_COLS}
          cells={cells}
          renderCell={renderCell}
          onCellClick={handleCellClick}
          boardColor={BOARD_COLOR}
        />
        <div className={styles.hud}>
          <p className={styles.turnIndicator}>{currentPlayer.name} köre</p>
          {activeTreasure && state.activeCard && (
            <div className={styles.activeCard}>
              <span className={styles.treasureSwatch} style={{ backgroundColor: activeTreasure.color }} />
              <span>
                {activeTreasure.label} — {state.activeCard.points} pont
              </span>
            </div>
          )}
          <p className={styles.drawPileCount}>{drawPileCount} lap maradt a pakliban</p>
          <ScoreboardList scoreboard={scoreboard} />
        </div>
        {isLocalMode && <LocalGameControls gameId="ramses" onRequestNewGame={onRequestNewGame} resumable={false} />}
      </div>
    </div>
  );
}

export default RamsesGamePage;
