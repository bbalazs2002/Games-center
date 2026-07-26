import { Suspense, useMemo, useState, type ReactNode } from 'react';
import { useTexture } from '@react-three/drei';
import { a, useSpring } from '@react-spring/three';
import type { GameTransport } from '../../../core/transport/GameTransport';
import { LocalGameTransport } from '../../../core/transport/LocalGameTransport';
import { useGameTransport } from '../../../core/transport/useGameTransport';
import { Modal } from '../../../ui-kit/Modal';
import {
  LoopTrackBoard3D,
  type InwardDirection,
  type LoopTrackSpace,
  type LoopTrackToken,
} from '../../../renderers/loop-track-3d/LoopTrackBoard3D';
import { computeSplineLoopPositions } from '../../../renderers/loop-track-3d/computeLoopPositions';
import { BOARD_SIZE, HOTEL_BOARD_CONTROL_POINTS, HOTEL_ZONE_CENTERS } from './hotelBoardLayout';
import type { HotelAction } from '../../../../shared/games/hotel/engine/actions';
import { createInitialState } from '../../../../shared/games/hotel/engine/initialState';
import { reducer } from '../../../../shared/games/hotel/engine/reducer';
import { getOwnedLots, getWinner } from '../../../../shared/games/hotel/engine/selectors';
import {
  PARKING_POSITION,
  type HotelLot,
  type HotelState,
  type PlayerId,
  type SpaceType,
} from '../../../../shared/games/hotel/engine/state';
import { GameLogPanel } from './GameLogPanel';
import { PlayerActionWheel } from './PlayerActionWheel';
import { useCashFlourishes, useRecentLotPurchases } from './useTransientLogEffects';
import styles from './HotelGamePage.module.css';

const PLAYER_COLORS = ['#e53e3e', '#3182ce', '#38a169', '#d69e2e'];
const PLAYER_COLOR_NAMES = ['piros', 'kék', 'zöld', 'sárga'];

// Geometric placeholders only — see docs/hotel-0a-specifikacio.md §5, real
// assets/textures come in Hotel-0c. Space color is by TYPE only, not by
// which specific hotel it's near (a space can touch 2 different hotels, so
// there's no single "this space's building height" to show here).
const SPACE_COLORS: Record<SpaceType, string> = {
  START: '#a0aec0',
  PURCHASE: '#68d391',
  CONSTRUCTION: '#f6ad55',
  FREE_STAIRCASE: '#63b3ed',
  FREE_BUILDING: '#b794f4',
};

interface HotelSpaceData {
  type: SpaceType;
  hasStaircase: boolean;
}

interface HotelTokenData {
  color: string;
}

function renderHotelSpace(data: HotelSpaceData, _inward: InwardDirection): ReactNode {
  return (
    <>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.9, 0.3, 0.9]} />
        <meshStandardMaterial color={SPACE_COLORS[data.type]} transparent opacity={0.55} />
      </mesh>
      {data.hasStaircase && (
        <mesh position={[0.3, 0.5, 0.3]}>
          <cylinderGeometry args={[0.08, 0.08, 0.4, 8]} />
          <meshStandardMaterial color="#8b5e3c" />
        </mesh>
      )}
    </>
  );
}

/** The real board photo, textured onto a flat box's top face — see docs/hotel-0c-specifikacio.md §5.1/§1. */
const BOARD_THICKNESS = 0.4;

function BoardBackground() {
  const texture = useTexture('/assets/hotel/board.jpg');
  return (
    <mesh position={[0, -BOARD_THICKNESS / 2, 0]}>
      <boxGeometry args={[BOARD_SIZE, BOARD_THICKNESS, BOARD_SIZE]} />
      <meshStandardMaterial attach="material-0" color="#1a1a1a" />
      <meshStandardMaterial attach="material-1" color="#1a1a1a" />
      <meshStandardMaterial attach="material-2" map={texture} />
      <meshStandardMaterial attach="material-3" color="#1a1a1a" />
      <meshStandardMaterial attach="material-4" color="#1a1a1a" />
      <meshStandardMaterial attach="material-5" color="#1a1a1a" />
    </mesh>
  );
}

/** File-name prefix for each hotel's already-curated photos — gardens/{name}-garden.png, property-cards/{name}-{const,nights}.jpg. */
const HOTEL_IMAGE_NAME: Record<string, string> = {
  waikiki: 'Waikiki',
  royal: 'Royal',
  letoile: 'Letoile',
  boomerang: 'Boomerang',
  tajmahal: 'TajMahal',
  safari: 'Safari',
  president: 'President',
  fujiyama: 'Fujiyama',
};

/** The real garden photo, flat on the board next to the hotel's buildings — a separate Suspense boundary so a garden texture loading later doesn't flicker the rest of the board. Pops/fades in on mount (i.e. the moment `hasGarden` first flips true) — see docs/hotel-animacio-specifikacio.md §4.3. */
function GardenDecal({ lotId }: { lotId: string }) {
  // .png, not .jpg — chroma-keyed transparent background, see
  // scripts/resize-hotel-images.mjs and docs/hotel-0c-specifikacio.md §5.2.
  const texture = useTexture(`/assets/hotel/gardens/${HOTEL_IMAGE_NAME[lotId]}-garden.png`);
  // Only the SCALE is spring-driven (not opacity too) — combining an
  // animated material's `opacity` with a `map` texture prop triggers an
  // excessive-type-instantiation error in the currently installed
  // @react-spring/three + three type versions; scale alone gives the "pops
  // in" feel this is after without fighting that.
  const spring = useSpring({ from: { scale: 0 }, to: { scale: 1 } });
  return (
    <a.mesh position={[0, 0.32, 1.3]} rotation={[-Math.PI / 2, 0, 0]} scale={spring.scale}>
      <planeGeometry args={[1.3, 1.3]} />
      <meshStandardMaterial map={texture} transparent alphaTest={0.5} />
    </a.mesh>
  );
}

/** One built unit, growing up from ground level the moment it mounts (i.e. the instant the reducer reports it as built) — see docs/hotel-animacio-specifikacio.md §4.3. */
function BuildingBox({ position }: { position: [number, number, number] }) {
  const spring = useSpring({ from: { scale: 0 }, to: { scale: 1 }, config: { tension: 260, friction: 18 } });
  return (
    <a.mesh position={position} scale={spring.scale}>
      <boxGeometry args={[0.4, 0.4, 0.4]} />
      <meshStandardMaterial color="#744210" />
    </a.mesh>
  );
}

/** A brief, buyer-colored pulse over a just-purchased lot's zone — see docs/hotel-animacio-specifikacio.md §4.4. Unmounts itself once the parent stops passing a color (useRecentLotPurchases' own timeout). */
function PurchasePulse({ color }: { color: string }) {
  const spring = useSpring({
    from: { scale: 0.6, opacity: 0.9 },
    to: { scale: 2.2, opacity: 0 },
    config: { duration: 1100 },
  });
  return (
    <a.mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={spring.scale}>
      <ringGeometry args={[0.8, 1, 32]} />
      <a.meshBasicMaterial color={color} transparent opacity={spring.opacity} />
    </a.mesh>
  );
}

/**
 * A hotel's built units cluster near its own zone on the real board, exactly
 * `buildingsBuilt` of them — not attached to any one track space, since a
 * space can border 2 hotels but a building unambiguously belongs to one.
 * Still a placeholder box per unit (real per-hotel models are Hotel-0c.2,
 * see docs/hotel-0c-specifikacio.md §2). The garden, in contrast, already
 * has a real, ready-made photo — no placeholder needed, shown as soon as
 * `hasGarden` flips.
 */
function HotelBuildingClusters({ lots, recentPurchaseColors }: { lots: HotelLot[]; recentPurchaseColors: Record<string, string> }) {
  return (
    <>
      {lots.map((lot) => {
        const center = HOTEL_ZONE_CENTERS[lot.id];
        const purchaseColor = recentPurchaseColors[lot.id];
        if (!center || (lot.buildingsBuilt === 0 && !lot.hasGarden && !purchaseColor)) return null;
        return (
          <group key={lot.id} position={center}>
            {Array.from({ length: lot.buildingsBuilt }, (_, buildingIndex) => (
              <BuildingBox
                key={buildingIndex}
                position={[(buildingIndex % 3) * 0.5 - 0.5, 0.25, Math.floor(buildingIndex / 3) * 0.5]}
              />
            ))}
            {lot.hasGarden && (
              <Suspense fallback={null}>
                <GardenDecal lotId={lot.id} />
              </Suspense>
            )}
            {purchaseColor && <PurchasePulse color={purchaseColor} />}
          </group>
        );
      })}
    </>
  );
}

function describeLot(state: HotelState, lot: HotelLot): string {
  const parts = [`${lot.buildingsBuilt}/${lot.buildingPrices.length} épület`];
  if (lot.hasGarden) parts.push('kert');
  if (state.board.some((space) => space.staircaseForLotId === lot.id)) parts.push('lépcső');
  return parts.join(', ');
}

function propertyCardUrl(lotId: string, kind: 'const' | 'nights'): string {
  return `/assets/hotel/property-cards/${HOTEL_IMAGE_NAME[lotId]}-${kind}.jpg`;
}

/**
 * The current player's own lots, so they can plan construction/staircase
 * moves without hunting the board. Each row's thumbnail is the real
 * property-card photo — clicking it opens both card faces (and the garden
 * photo, once built) full-size in a modal. Decorative on top of the existing
 * text info, per docs/hotel-0c-specifikacio.md §5.4 — the text stays the
 * primary, always-readable data source.
 */
function OwnedLotsPanel({ state }: { state: HotelState }) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const lots = getOwnedLots(state, currentPlayer.id);
  const [previewLotId, setPreviewLotId] = useState<string | null>(null);
  const previewLot = previewLotId ? lots.find((lot) => lot.id === previewLotId) : undefined;

  if (lots.length === 0) return null;

  return (
    <>
      <div className={styles.ownedLots}>
        <h3>{currentPlayer.name} telkei</h3>
        <ul>
          {lots.map((lot) => (
            <li key={lot.id}>
              <button
                className={styles.lotThumb}
                onClick={() => setPreviewLotId(lot.id)}
                aria-label={`${lot.name} kártyája`}
              >
                <img src={propertyCardUrl(lot.id, 'const')} alt="" />
              </button>
              <div className={styles.lotInfo}>
                <span className={styles.lotName}>{lot.name}</span>
                <span className={styles.lotDetail}>{describeLot(state, lot)}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {/* Rendered OUTSIDE .ownedLots on purpose: that panel has backdrop-filter,
          which (per the CSS spec) makes it a containing block for `position:
          fixed` descendants — the modal would end up clipped/positioned
          inside the small panel instead of centered over the whole page. */}
      <Modal open={previewLot !== undefined} onClose={() => setPreviewLotId(null)}>
        {previewLot && (
          <div className={styles.cardPreview}>
            <h3>{previewLot.name}</h3>
            <div className={styles.cardPreviewImages}>
              <img src={propertyCardUrl(previewLot.id, 'const')} alt="Építési árak" />
              <img src={propertyCardUrl(previewLot.id, 'nights')} alt="Éjszaka-árak" />
              {previewLot.hasGarden && (
                <img src={`/assets/hotel/gardens/${HOTEL_IMAGE_NAME[previewLot.id]}-garden.png`} alt="Kert" />
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/** A small real banknote as a decorative flourish behind the cash figure — the number stays the actual data source, per docs/hotel-0c-specifikacio.md §5.4. */
const CASH_NOTE_BREAKPOINTS: [number, string][] = [
  [5000, 'banknote-5000.jpg'],
  [1000, 'banknote-1000.jpg'],
  [500, 'banknote-500.jpg'],
  [100, 'banknote-100.jpg'],
  [0, 'banknote-50.jpg'],
];

function cashNoteFor(amount: number): string {
  const match = CASH_NOTE_BREAKPOINTS.find(([threshold]) => amount >= threshold);
  return `/assets/hotel/banknotes/${match?.[1] ?? 'banknote-50.jpg'}`;
}

/** Floating "+1200"/"−500" numbers rising and fading above the cash figure — see docs/hotel-animacio-specifikacio.md §4.2. */
function CashFlourishOverlay({ log, playerId }: { log: HotelState['log']; playerId: PlayerId }) {
  const flourishes = useCashFlourishes(log, playerId);
  if (flourishes.length === 0) return null;
  return (
    <div className={styles.cashFlourishStack}>
      {flourishes.map((flourish) => (
        <span
          key={flourish.id}
          className={[styles.cashFlourish, flourish.amount >= 0 ? styles.cashFlourishGain : styles.cashFlourishLoss].join(
            ' ',
          )}
        >
          {flourish.amount >= 0 ? '+' : '−'}
          {Math.abs(flourish.amount).toLocaleString('hu-HU')}
        </span>
      ))}
    </div>
  );
}

/** Floating glass status chip — current player, color, and cash (with a real banknote flourish) live right beside the wheel that drives the whole turn, per the "organize around the wheel" request. */
function StatusChip({ state, myPlayer }: { state: HotelState; myPlayer?: PlayerId }) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const colorIndex = state.currentPlayerIndex % PLAYER_COLORS.length;
  const you = myPlayer ? state.players.find((p) => p.id === myPlayer) : undefined;

  return (
    <div className={styles.statusChip}>
      <span className={styles.colorSwatch} style={{ backgroundColor: PLAYER_COLORS[colorIndex] }} />
      <div className={styles.statusText}>
        <span className={styles.statusName}>{currentPlayer.name}</span>
        <span className={styles.statusMeta}>
          {PLAYER_COLOR_NAMES[colorIndex]} bábu{you && you.id !== currentPlayer.id ? ` — Te vagy: ${you.name}` : ''}
        </span>
      </div>
      <div className={styles.cashChip}>
        <img src={cashNoteFor(currentPlayer.cash)} alt="" className={styles.cashNote} />
        <span>{currentPlayer.cash.toLocaleString('hu-HU')}</span>
        <CashFlourishOverlay log={state.log} playerId={currentPlayer.id} />
      </div>
    </div>
  );
}

function renderPlayerToken(data: HotelTokenData): ReactNode {
  return (
    <mesh>
      <coneGeometry args={[0.25, 0.6, 12]} />
      <meshStandardMaterial color={data.color} />
    </mesh>
  );
}

export interface HotelGamePageProps {
  /** Hot-seat only — ignored (a throwaway LocalGameTransport is still built but never used) once `transport` is provided. */
  playerNames?: string[];
  /** If omitted, a local LocalGameTransport is created for hot-seat mode — see docs/fazis-0b-multiplayer-specifikacio.md §6.2 and docs/hotel-0b-multiplayer-specifikacio.md. */
  transport?: GameTransport<HotelState, HotelAction>;
  /** Online mode only: which player slot the local client controls — gates PlayerActionWheel's interactivity. */
  myPlayer?: PlayerId;
}

/**
 * Hotel-0a local (hot-seat) vertical, generalized for Hotel-0b online play —
 * mirrors DamaGamePage's role: wires the shared reducer to a transport (local
 * or networked) and renders it, here via LoopTrackBoard3D + PlayerActionWheel
 * instead of GridBoard2D. See docs/hotel-0a-specifikacio.md, docs/hotel-0b-multiplayer-specifikacio.md.
 */
export function HotelGamePage({ playerNames, transport: providedTransport, myPlayer }: HotelGamePageProps) {
  const localTransport = useMemo(
    () => new LocalGameTransport<HotelState, HotelAction>(reducer, createInitialState(playerNames ?? [])),
    [playerNames],
  );
  const transport = providedTransport ?? localTransport;
  const [state, dispatch] = useGameTransport(transport);

  const spaces: LoopTrackSpace<HotelSpaceData>[] = useMemo(
    () =>
      state.board.map((space) => ({
        id: space.id,
        data: { type: space.type, hasStaircase: space.staircaseForLotId !== null },
      })),
    [state.board],
  );

  const boardPositions = useMemo(
    () => computeSplineLoopPositions(spaces.length, HOTEL_BOARD_CONTROL_POINTS),
    [spaces.length],
  );

  const tokens: LoopTrackToken<HotelTokenData>[] = state.players
    .map((player, index) => ({ player, color: PLAYER_COLORS[index % PLAYER_COLORS.length] }))
    // A bankrupt/forfeited player is out of the game — their token comes off the board entirely.
    .filter(({ player }) => !player.bankrupt)
    .map(({ player, color }) => ({
      // Stable across renders (never regenerated), so LoopTrackBoard3D can
      // animate this token's moves instead of unmounting/remounting it.
      id: player.id,
      // Before a player's first move they're at PARKING_POSITION (not a real
      // board index, see the "parkoló" note on Player.position) — approximate
      // it visually at Start (index 0) rather than crashing LoopTrackBoard3D's
      // position lookup. Pure display choice, doesn't touch real game state.
      spaceIndex: player.position === PARKING_POSITION ? 0 : player.position,
      token: { color },
    }));

  const recentPurchases = useRecentLotPurchases(state.log);
  const recentPurchaseColors: Record<string, string> = {};
  for (const purchase of recentPurchases) {
    const playerIndex = state.players.findIndex((player) => player.id === purchase.playerId);
    if (playerIndex >= 0) recentPurchaseColors[purchase.lotId] = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
  }

  const winner = getWinner(state);
  const currentPlayer = state.players[state.currentPlayerIndex];

  if (winner) {
    return (
      <div className={styles.page}>
        <h1>Vége a játéknak!</h1>
        <p>Győztes: {winner.name}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.canvasWrapper}>
        <LoopTrackBoard3D
          spaces={spaces}
          renderSpace={renderHotelSpace}
          tokens={tokens}
          renderToken={renderPlayerToken}
          positions={boardPositions}
          background={
            <>
              <BoardBackground />
              <HotelBuildingClusters lots={state.lots} recentPurchaseColors={recentPurchaseColors} />
            </>
          }
        />
        <OwnedLotsPanel state={state} />
        <GameLogPanel state={state} />
        <PlayerActionWheel state={state} dispatch={dispatch} interactive={!myPlayer || myPlayer === currentPlayer.id} />
        <StatusChip state={state} myPlayer={myPlayer} />
      </div>
    </div>
  );
}

export default HotelGamePage;
