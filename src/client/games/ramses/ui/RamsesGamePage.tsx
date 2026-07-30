import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTexture } from '@react-three/drei';
import { assetUrl } from '../../../core/assetUrl';
import type { GameTransport } from '../../../core/transport/GameTransport';
import { LocalGameTransport } from '../../../core/transport/LocalGameTransport';
import { useGameTransport } from '../../../core/transport/useGameTransport';
import { useLocalGameLogger } from '../../../core/transport/useLocalGameLogger';
import { Button } from '../../../ui-kit/Button';
import { useReportFeedbackContext } from '../../../ui-kit/FeedbackContext';
import { LocalGameControls } from '../../../ui-kit/LocalGameControls';
import { Modal } from '../../../ui-kit/Modal';
import { CELL_SIZE, GridBoard3D, type GridBoard3DCell } from '../../../renderers/grid-3d/GridBoard3D';
import { MaskedRamsesTransport } from './MaskedRamsesTransport';
import { RamsesActionWheel } from './RamsesActionWheel';
import ramsesModalTheme from './ramsesModalTheme.module.css';
import { useRamsesHotSeatAi, type HotSeatAiSlots } from './useRamsesHotSeatAi';
import type { RamsesAction } from '../../../../shared/games/ramses/engine/actions';
import { createInitialState } from '../../../../shared/games/ramses/engine/initialState';
import { reducer } from '../../../../shared/games/ramses/engine/reducer';
import { BOARD_COLS, BOARD_ROWS } from '../../../../shared/games/ramses/engine/rules';
import {
  getCurrentActiveCard,
  getCurrentPlayer,
  getCurrentSearchTarget,
  getDrawPileCount,
  getScoreboard,
  getSlidableCellIds,
  getWinners,
  type PlayerScore,
} from '../../../../shared/games/ramses/engine/selectors';
import type { Player, PlayerId, RamsesCell, RamsesState } from '../../../../shared/games/ramses/engine/state';
import { cardImagePath, getTreasureConfig, TREASURE_CONFIGS } from '../../../../shared/games/ramses/engine/treasureConfigs';
import styles from './RamsesGamePage.module.css';

// Purely decorative — pyramid color has no rule meaning in the base game
// (see docs/ramses-0a-specifikacio.md §2.1), just visual variety like the
// physical set's 16 gold/16 red/15 blue pieces.
const PYRAMID_COLORS = ['#d4a017', '#b23a48', '#3d5a80'];
const BOARD_COLOR = '#5c4a35';

// Real playtest report (2026-07-30): pyramids were much smaller than the
// physical pieces (which fill their whole square). A 4-sided cone's `radius`
// is its base square's CIRCUMRADIUS, so a square with side length CELL_SIZE
// has radius CELL_SIZE/√2 — shaved by 2% so adjacent bases sit just short of
// touching, avoiding z-fighting between neighbors on an imperfect grid.
const PYRAMID_BASE_RADIUS = (CELL_SIZE / Math.SQRT2) * 0.98;
// Keeps the original placeholder cone's height:radius proportions (0.7/0.45).
const PYRAMID_HEIGHT = PYRAMID_BASE_RADIUS * (0.7 / 0.45);

// Two nearly-coplanar transparent layers (the kincs-réteg plane at y=0.03 and
// the frame.png overlay at y=0.06) otherwise sort by camera distance every
// frame — real playtest report (2026-07-30): "egy bizonyos szögből látszik a
// kincs, de ha elforgatom a kamerát, akkor eltűnik" (visible from one angle,
// disappears on rotating the camera), the classic THREE.js transparent-
// z-sort symptom. Explicit renderOrder makes the draw order deterministic
// regardless of viewing angle; depthWrite:false on both keeps them from
// fighting each other in the depth buffer (still correctly occluded by the
// OPAQUE pyramids above them, which always depth-test normally).
const TREASURE_LAYER_RENDER_ORDER = 1;
const FRAME_OVERLAY_RENDER_ORDER = 2;

// Kicks off fetching every board-layer image as soon as this module loads —
// real playtest report (2026-07-30): without this, the first reveal of each
// treasure showed the flat-color Suspense fallback for a beat while its
// texture fetched on demand.
useTexture.preload(assetUrl('/assets/ramses/board/empty.png'));
useTexture.preload(assetUrl('/assets/ramses/board/frame.png'));
for (const treasure of TREASURE_CONFIGS) {
  if (treasure.imagePath) useTexture.preload(assetUrl(treasure.imagePath));
}

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

const SPECIAL_ANNOUNCEMENT_DURATION_MS = 2600;

/** Shown on the INITIAL entry into each naming phase (Ajándék/Kockázat/Sivatagi póker/Fata Morgana) — see useSpecialCardAnnouncement below. */
const SPECIAL_PHASE_LABELS: Partial<Record<RamsesState['turnPhase'], string>> = {
  AWAITING_GIFT_TARGET: '🎁 Ajándék kártya!',
  AWAITING_RISK_NAMING: '⚠️ Kockázat kártya!',
  AWAITING_POKER_NAMING: '🎲 Sivatagi póker kártya!',
  AWAITING_FATA_MORGANA_SLIDE: '🔮 Fata Morgana kártya!',
};

/**
 * A brief, prominent banner whenever something the player might otherwise
 * miss just happened automatically — Homokvihar's rotation, or a special
 * card being drawn. Real playtest report (2026-07-30): "A forgatás és
 * minden speciális kártya kihúzása legyen hangsúlyosabb. Mindenképp lássa a
 * játékos, hogy valami történik." Compares this render's state against the
 * PREVIOUS one (via a ref) to catch the actual TRANSITION, not just "is a
 * special phase currently active" (which would also re-fire on every
 * unrelated re-render while, say, the Ajándék wheel stays open). Doesn't
 * separately announce Záró (FINISH) — the winner screen that immediately
 * follows it is already unmissable.
 */
function useSpecialCardAnnouncement(state: RamsesState): string | null {
  const [announcement, setAnnouncement] = useState<{ id: number; text: string } | null>(null);
  const prevRef = useRef<{ turnPhase: RamsesState['turnPhase']; treasureLayerRotated: boolean } | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { turnPhase: state.turnPhase, treasureLayerRotated: state.treasureLayerRotated };
    if (!prev) return; // first render — nothing to compare against yet

    const text =
      prev.treasureLayerRotated !== state.treasureLayerRotated
        ? '🌪️ Homokvihar! A kincsréteg elfordult!'
        : prev.turnPhase !== state.turnPhase
          ? SPECIAL_PHASE_LABELS[state.turnPhase]
          : undefined;
    if (!text) return;

    idRef.current += 1;
    const id = idRef.current;
    setAnnouncement({ id, text });
    const timer = setTimeout(() => {
      setAnnouncement((current) => (current?.id === id ? null : current));
    }, SPECIAL_ANNOUNCEMENT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [state.turnPhase, state.treasureLayerRotated]);

  return announcement?.text ?? null;
}

/**
 * A brief banner whenever a card actually changes hands between two
 * PLAYERS (as opposed to a normal win off the draw pile) — Kockázat/Sivatagi
 * póker's blind draws, Fata Morgana keeping its borrowed card, or Ajándék's
 * own payout. Real playtest report (2026-07-30): "Arra is figyelmeztessen a
 * játék, ha valaki elhúz egy kártyát valaki mástól." Detected purely by
 * diffing `wonCards` between renders (a card id that disappears from one
 * player and appears on another in the SAME state update) rather than
 * threading a dedicated log field through the engine/Colyseus schema —
 * `wonCards` is already fully public, unmasked state (see rules.ts's
 * toPublicRamsesState), so this works identically in local and online play.
 * A normal draw-pile win only ever ADDS a card (never removes one from
 * anyone), so it never false-positives here.
 */
function useCardTransferAnnouncement(state: RamsesState): string | null {
  const [announcement, setAnnouncement] = useState<{ id: number; text: string } | null>(null);
  const prevWonCardIdsRef = useRef<Map<PlayerId, Set<string>> | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    const prev = prevWonCardIdsRef.current;
    const current = new Map<PlayerId, Set<string>>(state.players.map((player) => [player.id, new Set(player.wonCards.map((c) => c.id))]));
    prevWonCardIdsRef.current = current;
    if (!prev) return; // first render — nothing to compare against yet

    const removedFromPlayerId = new Map<string, PlayerId>();
    for (const player of state.players) {
      const prevIds = prev.get(player.id);
      if (!prevIds) continue;
      for (const cardId of prevIds) {
        if (!current.get(player.id)!.has(cardId)) removedFromPlayerId.set(cardId, player.id);
      }
    }

    const messages: string[] = [];
    for (const player of state.players) {
      const prevIds = prev.get(player.id) ?? new Set<string>();
      for (const card of player.wonCards) {
        if (prevIds.has(card.id)) continue; // not newly added this update
        const fromPlayerId = removedFromPlayerId.get(card.id);
        if (!fromPlayerId || fromPlayerId === player.id) continue; // not a cross-player move
        const fromPlayer = state.players.find((p) => p.id === fromPlayerId);
        if (!fromPlayer) continue;
        const treasure = getTreasureConfig(card.treasureId);
        messages.push(`🃏 ${player.name} lapot húzott ${fromPlayer.name} kártyái közül: ${treasure.label} (${card.points} pont)`);
      }
    }
    if (messages.length === 0) return;

    idRef.current += 1;
    const id = idRef.current;
    setAnnouncement({ id, text: messages.join(' ') });
    const timer = setTimeout(() => {
      setAnnouncement((current) => (current?.id === id ? null : current));
    }, SPECIAL_ANNOUNCEMENT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [state.players]);

  return announcement?.text ?? null;
}

/**
 * A brief "🎯 X köre!" banner (or "🤖 X gondolkodik..." when X is an
 * AI-controlled hot-seat slot) whenever the ACTIVE player changes. Two real
 * playtest reports (2026-07-30) at once: "Játékosok körének elején is
 * jelenjen meg értesítés", and "Az AI 'gondolkozzon' a körében a legelső
 * lépése előtt" — the AI's RAMSES_AI_MOVE_DELAY_MS pause before its first
 * move already existed (see useRamsesHotSeatAi/RamsesRoom.aiMoveDelayMs),
 * it just had zero visible feedback, so it read as no delay at all. Also
 * doubles as the fix for a third report in the same message ("a wrong
 * treasure reveal still lets me move once more"): a wrong reveal already
 * correctly passes the turn to the next player (see reducer.test.ts), it
 * just did so completely silently, which reads as "the game let me move
 * again" when it had actually already become someone else's turn.
 */
function useTurnStartAnnouncement(state: RamsesState, hotSeatAiSlots: HotSeatAiSlots): string | null {
  const [announcement, setAnnouncement] = useState<{ id: number; text: string } | null>(null);
  const prevPlayerIndexRef = useRef<number | null>(null);
  const idRef = useRef(0);
  // Read via a ref (same convention as useRamsesHotSeatAi's own aiSlotsRef)
  // so an inline `hotSeatAiSlots ?? {}` fallback at the call site — a NEW
  // object every render in online mode — doesn't force this effect to
  // tear down and re-run on every unrelated render.
  const aiSlotsRef = useRef(hotSeatAiSlots);
  aiSlotsRef.current = hotSeatAiSlots;

  useEffect(() => {
    const prev = prevPlayerIndexRef.current;
    prevPlayerIndexRef.current = state.currentPlayerIndex;
    if (prev === null || prev === state.currentPlayerIndex) return; // first render, or no real turn change

    const player = state.players[state.currentPlayerIndex];
    const text = aiSlotsRef.current[player.id] !== undefined ? `🤖 ${player.name} gondolkodik...` : `🎯 ${player.name} köre!`;

    idRef.current += 1;
    const id = idRef.current;
    setAnnouncement({ id, text });
    const timer = setTimeout(() => {
      setAnnouncement((current) => (current?.id === id ? null : current));
    }, SPECIAL_ANNOUNCEMENT_DURATION_MS);
    return () => clearTimeout(timer);
    // state.players deliberately included, NOT hotSeatAiSlots (read via the
    // ref above) — see the comment on aiSlotsRef.
  }, [state.currentPlayerIndex, state.players]);

  return announcement?.text ?? null;
}

/** Flat-color placeholder — shown via Suspense while RevealedCellPlane's real texture is still loading (and forever, for any treasureId this build has no real photo for). */
function FallbackPlane({ treasureId }: { treasureId: string | null }) {
  const treasure = treasureId ? getTreasureConfig(treasureId) : null;
  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={TREASURE_LAYER_RENDER_ORDER}>
      <planeGeometry args={[0.9, 0.9]} />
      <meshStandardMaterial color={treasure ? treasure.color : '#2b2b2b'} depthWrite={false} />
    </mesh>
  );
}

/** The real, resized photo (see docs/ramses-0a-specifikacio.md §8.1) of whichever treasure this cell shows — `board/empty.png` for a blank cell. Only ever rendered for the ONE currently-uncovered cell (renderCell below), whose `treasureId` the server has already Homokvihar-corrected before it ever reaches the client (see rules.ts's toPublicRamsesState) — no rotation math needed here. `useTexture` suspends, hence the per-cell Suspense boundary in renderCell below (pyramids never need one — they're plain geometry, no texture). */
function RevealedCellPlane({ treasureId }: { treasureId: string | null }) {
  const imagePath = treasureId ? getTreasureConfig(treasureId).imagePath! : '/assets/ramses/board/empty.png';
  const texture = useTexture(assetUrl(imagePath));
  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={TREASURE_LAYER_RENDER_ORDER}>
      <planeGeometry args={[0.9, 0.9]} />
      <meshStandardMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/** Pyramids stay simple colored cones (see PYRAMID_COLORS) — the real physical pieces are plain, unmarked plastic, nothing to photograph/texture. Only the "what's under it" layer gets a real photo. */
function renderCell(cell: RamsesCellViewData) {
  if (cell.hasPyramid) {
    return (
      <mesh position={[0, PYRAMID_HEIGHT / 2, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[PYRAMID_BASE_RADIUS, PYRAMID_HEIGHT, 4]} />
        <meshStandardMaterial color={cell.pyramidColor} />
      </mesh>
    );
  }

  return (
    <Suspense fallback={<FallbackPlane treasureId={cell.treasureId} />}>
      <RevealedCellPlane treasureId={cell.treasureId} />
    </Suspense>
  );
}

/**
 * Decorative keret-overlay, sitting above the kincs-réteg plane (y=0.03) and
 * below the pyramids (y=PYRAMID_HEIGHT/2) — GridBoard3D's `background` prop,
 * sized to exactly cover the cell grid using the SAME per-cell spacing
 * GridBoard3D itself uses internally (`CELL_SIZE`, exported for exactly
 * this). Mostly transparent (confirmed: real alpha variation, not a
 * uniformly-opaque photo) except decorative borders/joints between cells —
 * see docs/ramses-0a-specifikacio.md §8.1.
 */
function RamsesBoardFrame() {
  const texture = useTexture(assetUrl('/assets/ramses/board/frame.png'));
  return (
    <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={FRAME_OVERLAY_RENDER_ORDER}>
      <planeGeometry args={[BOARD_COLS * CELL_SIZE, BOARD_ROWS * CELL_SIZE]} />
      <meshStandardMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/**
 * The current search target, shown as either a real, clickable-to-enlarge
 * photo of the exact drawn card (when one exists — SEARCHING's activeCard or
 * Fata Morgana's borrowed card, see getCurrentActiveCard) or the plain
 * treasure icon (Ajándék/Kockázat/Sivatagi póker's freely-named targets have
 * no specific card/points to show a photo of). Real playtest report
 * (2026-07-30): "Látszódjon, hogy melyik lapot húzta a játékos, lehessen
 * kinagyítani."
 */
function RamsesActiveCardDisplay({
  treasureId,
  label,
  color,
  imagePath,
  points,
}: {
  treasureId: string;
  label: string;
  color: string;
  imagePath: string | undefined;
  points: number | null;
}) {
  const [zoomed, setZoomed] = useState(false);
  const cardPath = points !== null ? assetUrl(cardImagePath(treasureId, points)) : null;

  return (
    <>
      <button type="button" className={styles.activeCardButton} onClick={() => cardPath && setZoomed(true)}>
        {cardPath ? (
          <img src={cardPath} alt={label} className={styles.cardThumb} />
        ) : (
          <span
            className={styles.treasureSwatch}
            style={{ backgroundColor: color, backgroundImage: imagePath ? `url(${assetUrl(imagePath)})` : undefined }}
          />
        )}
        <span>
          {label}
          {points !== null ? ` — ${points} pont` : ''}
        </span>
      </button>
      {cardPath && (
        <Modal open={zoomed} onClose={() => setZoomed(false)} className={ramsesModalTheme.ramsesModal}>
          <img src={cardPath} alt={label} className={styles.zoomedCard} />
        </Modal>
      )}
    </>
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
  const navigate = useNavigate();
  return (
    <div className={styles.winnerPage}>
      <div className={styles.winnerCard}>
        <h1>Vége a játéknak!</h1>
        <p>
          {winners.length > 1
            ? `Holtverseny: ${winners.map((w) => w.name).join(', ')}`
            : `Győztes: ${winners[0]?.name}`}
        </p>
        <ScoreboardList scoreboard={scoreboard} />
        <div className={styles.winnerActions}>
          {showNewGameButton && onRequestNewGame && <Button onClick={onRequestNewGame}>Új játék</Button>}
          <Button variant="secondary" onClick={() => navigate('/')}>
            Főmenü
          </Button>
        </div>
      </div>
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
  /** Hot-seat only — see docs/ramses-0a-specifikacio.md §8.3. Ignored once `transport` is provided (the room's own creation options already decided this server-side). Defaults to true. */
  includeSpecialCards?: boolean;
}

/**
 * Ramses-0a hot-seat vertical, generalized for Ramses-0b online play,
 * Ramses-0c AI opponents, and the Ramses-0a §8 speciális kártyák kiegészítés
 * — mirrors HotelGamePage's role: wires the shared reducer to a transport
 * (local or networked) and renders it via GridBoard3D (see
 * docs/ramses-0a-specifikacio.md §5, docs/ramses-0b-specifikacio.md §3.6).
 * Unlike Hotel, the 3D board itself is STILL the primary interaction surface
 * for every real move (SLIDE_PYRAMID, whether searching normally or mid a
 * special card's own slide-chain) — `RamsesActionWheel` only ever appears
 * for the rare, list-shaped naming decisions 3 of the special cards need
 * (Ajándék/Kockázat/Sivatagi póker — see §8.4), never for the board move
 * itself.
 */
export function RamsesGamePage({
  playerNames,
  transport: providedTransport,
  myPlayer,
  hotSeatAiSlots,
  onRequestNewGame,
  includeSpecialCards = true,
}: RamsesGamePageProps) {
  const isLocalMode = providedTransport === undefined;
  const localTransport = useMemo(
    () => new LocalGameTransport<RamsesState, RamsesAction>(reducer, createInitialState(playerNames ?? [], { includeSpecialCards })),
    // Deliberately NOT keyed on includeSpecialCards — like playerNames, it's
    // only ever meant to seed the transport once, at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const specialAnnouncement = useSpecialCardAnnouncement(state);
  const transferAnnouncement = useCardTransferAnnouncement(state);
  const turnAnnouncement = useTurnStartAnnouncement(state, hotSeatAiSlots ?? {});

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
  // The normal activeCard OR a special card's own in-progress target (Ajándék/
  // Kockázat/Sivatagi póker/Fata Morgana) — see getCurrentSearchTarget's doc comment.
  const searchTargetId = getCurrentSearchTarget(state);
  const searchTargetConfig = searchTargetId ? getTreasureConfig(searchTargetId) : null;
  const activeCardObject = getCurrentActiveCard(state);
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
          background={<RamsesBoardFrame />}
        />
        {specialAnnouncement && (
          <div className={styles.specialAnnouncement} key={specialAnnouncement}>
            {specialAnnouncement}
          </div>
        )}
        {transferAnnouncement && (
          <div className={styles.transferAnnouncement} key={transferAnnouncement}>
            {transferAnnouncement}
          </div>
        )}
        {turnAnnouncement && (
          <div className={styles.turnAnnouncement} key={turnAnnouncement}>
            {turnAnnouncement}
          </div>
        )}
        <div className={styles.hud}>
          <p className={styles.turnIndicator}>{currentPlayer.name} köre</p>
          {searchTargetConfig && (
            <RamsesActiveCardDisplay
              treasureId={searchTargetConfig.id}
              label={searchTargetConfig.label}
              color={searchTargetConfig.color}
              imagePath={searchTargetConfig.imagePath}
              points={activeCardObject?.points ?? null}
            />
          )}
          <p className={styles.drawPileCount}>{drawPileCount} lap maradt a pakliban</p>
          <ScoreboardList scoreboard={scoreboard} />
        </div>
        <RamsesActionWheel state={state} dispatch={dispatch} interactive={isMyTurn && !isCurrentPlayerAi} />
        {isLocalMode && <LocalGameControls gameId="ramses" onRequestNewGame={onRequestNewGame} resumable={false} />}
      </div>
    </div>
  );
}

export default RamsesGamePage;
