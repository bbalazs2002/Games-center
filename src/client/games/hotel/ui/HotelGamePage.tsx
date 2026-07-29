import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTexture } from '@react-three/drei';
import { a, useSpring } from '@react-spring/three';
import { Vector3 } from 'three';
import type { GameTransport } from '../../../core/transport/GameTransport';
import { LocalGameTransport } from '../../../core/transport/LocalGameTransport';
import { useGameTransport } from '../../../core/transport/useGameTransport';
import { useLocalGameLogger } from '../../../core/transport/useLocalGameLogger';
import { Button } from '../../../ui-kit/Button';
import { useReportFeedbackContext } from '../../../ui-kit/FeedbackContext';
import { LocalGameControls } from '../../../ui-kit/LocalGameControls';
import { Modal } from '../../../ui-kit/Modal';
import { cloneWithOpacity, cloneWithTint } from '../../../renderers/models/materialTint';
import { useGLTFScene } from '../../../renderers/models/useGLTFScene';
import { LoopTrackBoard3D, type LoopTrackSpace, type LoopTrackToken } from '../../../renderers/loop-track-3d/LoopTrackBoard3D';
import { computeSplineLoopPositions } from '../../../renderers/loop-track-3d/computeLoopPositions';
import { BOARD_SIZE, HOTEL_BOARD_CONTROL_POINTS, HOTEL_ZONE_CENTERS } from './hotelBoardLayout';
import {
  HOTEL_IMAGE_NAME,
  HOTEL_MODEL_URL,
  HOTEL_SCENE_SCALE,
  HOTEL_UP_ROTATION,
  hotelBuildingObjectName,
  hotelGardenObjectName,
  hotelStairsObjectName,
  propertyCardUrl,
} from './hotelModelAssets';
import { HotelLotFacts } from './HotelLotFacts';
import { clearPersistedHotelLocalGame, saveHotelLocalGame } from './hotelLocalGamePersistence';
import { type StaircasePlacementMode } from './hotelMenuLevels';
import modalTheme from './hotelModalTheme.module.css';
import { useHotelParkingPositions, type HotelParkingTransform } from './useHotelParkingPositions';
import { useHotelSpacePositions } from './useHotelSpacePositions';
import type { HotelAction } from '../../../../shared/games/hotel/engine/actions';
import { createInitialState } from '../../../../shared/games/hotel/engine/initialState';
import { reducer } from '../../../../shared/games/hotel/engine/reducer';
import {
  getFreeStaircaseCandidates,
  getRemainingBidderIds,
  getStaircaseSpaceOptions,
  type FreeStaircaseCandidate,
} from '../../../../shared/games/hotel/engine/rules';
import { getOwnedLots, getWinner } from '../../../../shared/games/hotel/engine/selectors';
import type { HotelLot, HotelState, Player, PlayerId } from '../../../../shared/games/hotel/engine/state';
import { GameLogPanel } from './GameLogPanel';
import { PlayerActionWheel } from './PlayerActionWheel';
import { useCashFlourishes, useRecentLotPurchases, type RecentLotPurchase } from './useTransientLogEffects';
import { useHotSeatAi, type HotSeatAiSlots } from './useHotSeatAi';
import styles from './HotelGamePage.module.css';

// Index order matches HOTEL_PARKING_COLOR_NAMES (hotelModelAssets.ts) — index
// i's hex color always corresponds to that array's i'th color name, so a
// player's parking spot can be looked up by their color-assignment index.
const PLAYER_COLORS = ['#e53e3e', '#3182ce', '#38a169', '#d69e2e'];
const PLAYER_COLOR_NAMES = ['piros', 'kék', 'zöld', 'sárga'];

interface HotelTokenData {
  color: string;
  playerId: PlayerId;
}

/**
 * Every space's real appearance now comes entirely from the real board
 * texture/model (confirmed correctly aligned — see
 * docs/hotel-0c-specifikacio.md §5.8) — no separate marker/proxy geometry
 * needed anymore. `renderSpace` is still a required `LoopTrackBoard3D` prop
 * (it also drives per-space click hit-testing, unused by Hotel), so this
 * stays as a real, if trivial, no-op rather than being removed.
 */
function renderHotelSpace(): ReactNode {
  return null;
}

/** The real board photo, textured onto a flat box's top face — see docs/hotel-0c-specifikacio.md §5.1/§1. */
const BOARD_THICKNESS = 0.4 * HOTEL_SCENE_SCALE;

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

/**
 * One named object out of the combined Blender board scene, rendered
 * UNWRAPPED (no positioning group beyond the up-rotation) so its own baked,
 * author-placed position shows through directly — see
 * docs/hotel-0c-specifikacio.md §5.5/5.7.
 *
 * Position and scale are used exactly as authored, with NO correction — see
 * `HOTEL_SCENE_SCALE`'s doc comment (`hotelModelAssets.ts`) for why the rest
 * of the scene (camera, controls, every purely-decorative local size) is
 * scaled up to match this instead of shrinking the real model's own data.
 */
function HotelModelObject({
  objectName,
  colorTint,
  fallback = null,
}: {
  objectName: string;
  colorTint?: string;
  fallback?: ReactNode;
}) {
  const scene = useGLTFScene(HOTEL_MODEL_URL);
  const prepared = useMemo(() => {
    const found = scene?.getObjectByName(objectName);
    return found ? cloneWithTint(found, colorTint) : null;
  }, [scene, objectName, colorTint]);

  if (!prepared) return <>{fallback}</>;
  return (
    <group rotation={HOTEL_UP_ROTATION}>
      {/* dispose={null}: `prepared`'s geometry is a SHARED reference into the
          cached `useGLTFScene` scene graph (three.js's own Mesh.copy never
          deep-clones geometry) — R3F's default auto-dispose-on-unmount would
          otherwise permanently destroy that shared geometry for every other
          consumer of the same named object the moment ANY one of them
          unmounts (confirmed root cause of "lépcső eltűnik lerakás után",
          see docs/hotel-0c-specifikacio.md §5.11.1). */}
      <primitive object={prepared} dispose={null} />
    </group>
  );
}

/**
 * The real, Blender-modeled board (see docs/hotel-0c-specifikacio.md §5.7) —
 * falls back to the flat textured box (`BoardBackground`) until the model
 * loads. `Bank`/`cityHall` are purely decorative board-center buildings with
 * no game-state dependency, so they get no fallback of their own (nothing
 * shown for them until the real model arrives, matching what already existed
 * — there was never a placeholder for these two).
 */
function HotelBoardModel() {
  return (
    <>
      <HotelModelObject objectName="board" fallback={<BoardBackground />} />
      <HotelModelObject objectName="Bank" />
      <HotelModelObject objectName="cityHall" />
    </>
  );
}

/** The real garden photo, flat on the board next to the hotel's buildings — a separate Suspense boundary so a garden texture loading later doesn't flicker the rest of the board. Pops/fades in on mount (i.e. the moment `hasGarden` first flips true) — see docs/hotel-animacio-specifikacio.md §4.3. Used as the fallback for the real Hotel-0c.2 garden model, so it now takes an explicit `center` (absolute position) instead of relying on a wrapping group. */
function GardenDecal({ lotId, center }: { lotId: string; center: Vector3 }) {
  // .png, not .jpg — chroma-keyed transparent background, see
  // scripts/resize-hotel-images.mjs and docs/hotel-0c-specifikacio.md §5.2.
  const texture = useTexture(`/assets/hotel/gardens/${HOTEL_IMAGE_NAME[lotId]}-garden.png`);
  // Only the SCALE is spring-driven (not opacity too) — combining an
  // animated material's `opacity` with a `map` texture prop triggers an
  // excessive-type-instantiation error in the currently installed
  // @react-spring/three + three type versions; scale alone gives the "pops
  // in" feel this is after without fighting that.
  const spring = useSpring({ from: { scale: 0 }, to: { scale: 1 } });
  const s = HOTEL_SCENE_SCALE;
  return (
    <a.mesh position={[center.x, 0.32 * s, center.z + 1.3 * s]} rotation={[-Math.PI / 2, 0, 0]} scale={spring.scale}>
      <planeGeometry args={[1.3 * s, 1.3 * s]} />
      <meshStandardMaterial map={texture} transparent alphaTest={0.5} />
    </a.mesh>
  );
}

/** One built unit, growing up from ground level the moment it mounts (i.e. the instant the reducer reports it as built) — see docs/hotel-animacio-specifikacio.md §4.3. */
function BuildingBox({ position }: { position: [number, number, number] }) {
  const spring = useSpring({ from: { scale: 0 }, to: { scale: 1 }, config: { tension: 260, friction: 18 } });
  const s = HOTEL_SCENE_SCALE;
  return (
    <a.mesh position={position} scale={spring.scale}>
      <boxGeometry args={[0.4 * s, 0.4 * s, 0.4 * s]} />
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
  const s = HOTEL_SCENE_SCALE;
  return (
    <a.mesh position={[0, 0.05 * s, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={spring.scale}>
      <ringGeometry args={[0.8 * s, 1 * s, 32]} />
      <a.meshBasicMaterial color={color} transparent opacity={spring.opacity} />
    </a.mesh>
  );
}

/** Absolute world position for a building-tier's OLD placeholder box, since (unlike the real model) it has no baked position of its own — mirrors the grid layout the placeholder always used, just computed without a wrapping group now that real tiers render unwrapped at their own baked positions. */
function buildingFallbackPosition(center: Vector3, buildingIndex: number): [number, number, number] {
  const s = HOTEL_SCENE_SCALE;
  return [
    center.x + ((buildingIndex % 3) * 0.5 - 0.5) * s,
    0.25 * s,
    center.z + Math.floor(buildingIndex / 3) * 0.5 * s,
  ];
}

/**
 * A hotel's built units cluster near its own zone on the real board, exactly
 * `buildingsBuilt` of them — not attached to any one track space, since a
 * space can border 2 hotels but a building unambiguously belongs to one.
 * Renders the REAL Blender model per tier/garden/staircase once available
 * (see docs/hotel-0c-specifikacio.md §5.5/5.7) — each one already sits at its
 * own correct, author-placed position (no wrapping group needed, unlike the
 * fallback placeholders, which still use the old eyeballed `HOTEL_ZONE_CENTERS`
 * anchor since they have no baked position of their own).
 */
function HotelBuildingClusters({
  board,
  lots,
  recentPurchaseColors,
}: {
  board: HotelState['board'];
  lots: HotelLot[];
  recentPurchaseColors: Record<string, string>;
}) {
  return (
    <>
      {lots.map((lot) => {
        const center = HOTEL_ZONE_CENTERS[lot.id];
        const purchaseColor = recentPurchaseColors[lot.id];
        const assetName = HOTEL_IMAGE_NAME[lot.id];
        // A hotel can hold staircases on MULTIPLE spaces at once (only one
        // staircase per SPACE is capped, not per lot — see
        // docs/hotel-0a-specifikacio.md §3.1 "Lépcsők elhelyezése"), so every
        // matching space must render its own model, not just the first one.
        const staircaseSpaceIndices = board.reduce<number[]>((indices, space, index) => {
          if (space.staircaseForLotId === lot.id) indices.push(index);
          return indices;
        }, []);

        return (
          <Suspense key={lot.id} fallback={null}>
            {Array.from({ length: lot.buildingsBuilt }, (_, buildingIndex) => {
              const tier = buildingIndex + 1;
              return (
                <HotelModelObject
                  key={tier}
                  objectName={hotelBuildingObjectName(assetName, tier, lot.buildingPrices.length)}
                  fallback={
                    center ? <BuildingBox position={buildingFallbackPosition(center, buildingIndex)} /> : null
                  }
                />
              );
            })}
            {lot.hasGarden && (
              <HotelModelObject
                objectName={hotelGardenObjectName(assetName)}
                fallback={center ? <GardenDecal lotId={lot.id} center={center} /> : null}
              />
            )}
            {staircaseSpaceIndices.map((spaceIndex) => (
              // No fallback — the real model is confirmed reliably present
              // for stairs (see docs/hotel-0c-specifikacio.md §5.8), and the
              // old space-local placeholder marker was removed once that was
              // confirmed.
              <HotelModelObject
                key={`stairs-${spaceIndex}`}
                objectName={hotelStairsObjectName(spaceIndex + 1, lot.id)}
              />
            ))}
            {center && purchaseColor && (
              <group position={center}>
                <PurchasePulse color={purchaseColor} />
              </group>
            )}
          </Suspense>
        );
      })}
    </>
  );
}

/**
 * One clickable, translucent preview of where a staircase COULD go — the
 * exact same named `stairs-<mező>-<lotId>` model a real, already-placed
 * staircase uses (see `HotelBuildingClusters` above), just faded and
 * click-to-choose instead of solid — so the location choice happens by
 * clicking directly on the board rather than picking from a wheel list (per
 * the user's request). Hover brightens it slightly for affordance.
 */
function StaircaseCandidateMarker({
  candidate,
  spaceNumber,
  onSelect,
}: {
  candidate: FreeStaircaseCandidate;
  spaceNumber: number;
  onSelect: (candidate: FreeStaircaseCandidate) => void;
}) {
  const scene = useGLTFScene(HOTEL_MODEL_URL);
  const [hovered, setHovered] = useState(false);
  const objectName = hotelStairsObjectName(spaceNumber, candidate.lotId);
  const prepared = useMemo(() => {
    const found = scene?.getObjectByName(objectName);
    // The real stairs pieces are small and often close in color to the
    // board's own printed icons (confirmed via a live Playwright check,
    // projecting the object's world position to screen space and cropping
    // that exact pixel region — otherwise near-invisible in a normal
    // screenshot), so the base opacity is deliberately higher than a
    // typical "ghost preview" to stay a reliably visible affordance.
    return found ? cloneWithOpacity(found, hovered ? 0.9 : 0.6) : null;
  }, [scene, objectName, hovered]);

  if (!prepared) return null;
  return (
    <group
      rotation={HOTEL_UP_ROTATION}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(candidate);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
    >
      {/* dispose={null} — see HotelModelObject's identical comment. This is
          the component whose unmount (on commit OR Mégse) originally
          triggered the bug: its geometry AND its material's own texture
          reference (THREE.Material.clone() shares textures, doesn't deep-copy
          them either) both point back into the shared cached scene. */}
      <primitive object={prepared} dispose={null} />
    </group>
  );
}

/** Every currently-clickable staircase-placement spot at once — see `staircaseCandidatesFor` for how the list is derived from `staircasePlacement`. */
function StaircaseCandidateOverlay({
  candidates,
  board,
  onSelect,
}: {
  candidates: FreeStaircaseCandidate[];
  board: HotelState['board'];
  onSelect: (candidate: FreeStaircaseCandidate) => void;
}) {
  return (
    <Suspense fallback={null}>
      {candidates.map((candidate) => {
        const spaceIndex = board.findIndex((space) => space.id === candidate.spaceId);
        if (spaceIndex === -1) return null;
        return (
          <StaircaseCandidateMarker
            key={`${candidate.lotId}-${candidate.spaceId}`}
            candidate={candidate}
            spaceNumber={spaceIndex + 1}
            onSelect={onSelect}
          />
        );
      })}
    </Suspense>
  );
}

/** Spaces eligible for the currently-armed staircase placement, if any — paid mode is scoped to the one already-chosen lot, free mode spans every owned lot at once (matching the old wheel-submenu's own candidate lists, just now rendered on the board instead of listed). */
function staircaseCandidatesFor(
  state: HotelState,
  currentPlayerId: PlayerId,
  placement: StaircasePlacementMode | null,
): FreeStaircaseCandidate[] {
  if (!placement) return [];
  if (placement.kind === 'paid') {
    return getStaircaseSpaceOptions(state, placement.lotId).map((space) => ({
      lotId: placement.lotId,
      spaceId: space.id,
    }));
  }
  return getFreeStaircaseCandidates(state, currentPlayerId);
}

function describeLot(state: HotelState, lot: HotelLot): string {
  const parts = [`${lot.buildingsBuilt}/${lot.buildingPrices.length} épület`];
  if (lot.hasGarden) parts.push('kert');
  if (state.board.some((space) => space.staircaseForLotId === lot.id)) parts.push('lépcső');
  return parts.join(', ');
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
      <Modal open={previewLot !== undefined} onClose={() => setPreviewLotId(null)} className={modalTheme.hotelModal}>
        {previewLot && (
          <div className={styles.cardPreview}>
            <h3>{previewLot.name}</h3>
            <HotelLotFacts lot={previewLot} />
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
function StatusChip({ state, myPlayer, isCurrentPlayerAi }: { state: HotelState; myPlayer?: PlayerId; isCurrentPlayerAi: boolean }) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const colorIndex = state.currentPlayerIndex % PLAYER_COLORS.length;
  const you = myPlayer ? state.players.find((p) => p.id === myPlayer) : undefined;

  return (
    <div className={styles.statusChip}>
      <span className={styles.colorSwatch} style={{ backgroundColor: PLAYER_COLORS[colorIndex] }} />
      <div className={styles.statusText}>
        <span className={styles.statusName}>
          {currentPlayer.name}
          {isCurrentPlayerAi && ' (AI gondolkodik…)'}
        </span>
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

/**
 * Always-visible roster of every player (name, color, cash) — a real
 * playtest request (2026-07-27): before this, only the CURRENT player's
 * money/lots were visible anywhere on screen, so checking an opponent's
 * standing meant waiting for their turn. Clicking a row (or a player's own
 * token on the board, see `HotelCarToken`) opens `PlayerInfoModal` with that
 * player's full detail, regardless of whose turn it currently is.
 */
function PlayerRoster({ state, onInspect }: { state: HotelState; onInspect: (playerId: PlayerId) => void }) {
  return (
    <div className={styles.roster}>
      {state.players.map((player, index) => (
        <button
          key={player.id}
          className={[styles.rosterRow, player.bankrupt && styles.rosterRowBankrupt].filter(Boolean).join(' ')}
          onClick={() => onInspect(player.id)}
          disabled={player.bankrupt}
        >
          <span className={styles.colorSwatch} style={{ backgroundColor: PLAYER_COLORS[index % PLAYER_COLORS.length] }} />
          <span className={styles.rosterName}>{player.name}</span>
          <span className={styles.rosterCash}>
            {player.bankrupt ? 'csődben' : player.cash.toLocaleString('hu-HU')}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Full detail (name, color, cash, owned lots) for ANY player, opened either
 * from `PlayerRoster` or by clicking that player's token on the board — see
 * `PlayerRoster`'s doc comment for the playtest request behind this.
 */
function PlayerInfoModal({
  state,
  playerId,
  onClose,
}: {
  state: HotelState;
  playerId: PlayerId | null;
  onClose: () => void;
}) {
  const playerIndex = playerId ? state.players.findIndex((p) => p.id === playerId) : -1;
  const player = playerIndex >= 0 ? state.players[playerIndex] : undefined;
  const lots = player ? getOwnedLots(state, player.id) : [];

  return (
    <Modal open={player !== undefined} onClose={onClose} className={modalTheme.hotelModal}>
      {player && (
        <div className={styles.playerInfoModal}>
          <h2>
            <span className={styles.colorSwatch} style={{ backgroundColor: PLAYER_COLORS[playerIndex % PLAYER_COLORS.length] }} />
            {player.name}
          </h2>
          <p className={styles.playerInfoCash}>Pénz: {player.cash.toLocaleString('hu-HU')}</p>
          {player.bankrupt && <p>Ez a játékos csődbe ment.</p>}
          <h3>Telkek</h3>
          {lots.length === 0 ? (
            <p>Nincs telke.</p>
          ) : (
            <ul className={styles.playerInfoLots}>
              {lots.map((lot) => (
                <li key={lot.id}>
                  <span className={styles.lotName}>{lot.name}</span>
                  <span className={styles.lotDetail}>{describeLot(state, lot)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

function PlaceholderToken({ color }: { color: string }) {
  const s = HOTEL_SCENE_SCALE;
  return (
    <mesh>
      <coneGeometry args={[0.25 * s, 0.6 * s, 12]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/**
 * The real car model (see docs/hotel-0c-specifikacio.md §5.5/5.7/5.8),
 * recolored per player and re-centered/re-oriented to local origin —
 * `car-1`'s shape is reused for every token regardless of which space it's
 * actually on (the 31 car-N objects are duplicates of the same model, just
 * individually positioned/rotated). `AnimatedToken` (LoopTrackBoard3D)
 * already handles the ABSOLUTE board position AND per-space rotation via the
 * `positions`/`rotations` arrays (see `useHotelSpacePositions`) — so the
 * token's own baked position/rotation would double up with that and must be
 * zeroed out here entirely, unlike `HotelModelObject`'s usual "unwrapped,
 * absolute" usage for buildings/board (which has no outer group already
 * supplying its own orientation). Falls back to the placeholder cone.
 */
function HotelCarToken({ color, onClick }: { color: string; onClick: () => void }) {
  const scene = useGLTFScene(HOTEL_MODEL_URL);
  const tinted = useMemo(() => {
    const source = scene?.getObjectByName('car-1');
    if (!source) return null;
    const clone = cloneWithTint(source, color);
    clone.position.set(0, 0, 0);
    clone.quaternion.identity();
    // Scale is used AS-IS (car-1's own baked scale, unmodified) — see
    // HOTEL_SCENE_SCALE's doc comment for why (hotelModelAssets.ts).
    return clone;
  }, [scene, color]);

  // Clicking a token reveals that player's own data (money/lots/name) even
  // when it's not their turn — a real playtest request (2026-07-27):
  // otherwise only the current player's panel is visible at all.
  const handleClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onClick();
  };
  const handlePointerOver = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    document.body.style.cursor = 'pointer';
  };
  const handlePointerOut = () => {
    document.body.style.cursor = 'auto';
  };

  if (!tinted) {
    return (
      <group onClick={handleClick} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
        <PlaceholderToken color={color} />
      </group>
    );
  }
  return (
    <group onClick={handleClick} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
      {/* dispose={null} — see HotelModelObject's comment on the same issue.
          Matters here specifically because a token UNMOUNTS when its player
          goes bankrupt (buildHotelTokens filters them out) — without this,
          that would silently destroy the shared 'car-1' geometry every
          remaining player's own token clone also depends on. */}
      <primitive object={tinted} dispose={null} />
    </group>
  );
}

/** Which player-color a just-purchased lot should pulse in, keyed by `lotId` — see `PurchasePulse`. */
function buildRecentPurchaseColors(purchases: RecentLotPurchase[], players: Player[]): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const purchase of purchases) {
    const playerIndex = players.findIndex((player) => player.id === purchase.playerId);
    if (playerIndex >= 0) colors[purchase.lotId] = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
  }
  return colors;
}

/**
 * Whether the wheel should currently accept input. Normally just "is it MY
 * turn (online) and is the current player not AI-controlled (hot-seat)" —
 * but `currentPlayerIndex` stays pointed at whoever STARTED an auction (the
 * auctioneer) for its ENTIRE duration, while `PLACE_BID`/`PASS_BID` are
 * scoped to individual bidders, not the current player (see rules.ts's
 * canPlaceBid/canPassBid — any non-auctioneer may act, not just whoever's
 * turn it nominally is). Gating on `currentPlayer` alone during an auction
 * wrongly hides the wheel from a human bidder whenever the auctioneer
 * happens to be AI-controlled (hot-seat) or isn't `myPlayer` (online) —
 * confirmed as a real, game-softlocking bug (playtest 2026-07-29): an
 * AI-started auction left a human bidder with no way to bid or pass at all.
 */
function isWheelInteractive(
  state: HotelState,
  myPlayer: PlayerId | undefined,
  hotSeatAiSlots: HotSeatAiSlots,
  currentPlayer: Player,
): boolean {
  if (state.turnPhase === 'AUCTION_IN_PROGRESS') {
    const remainingBidderIds = getRemainingBidderIds(state);
    const isMineOrHotSeat = !myPlayer || remainingBidderIds.includes(myPlayer);
    const awaitingAHuman = remainingBidderIds.some((id) => hotSeatAiSlots[id] === undefined);
    return isMineOrHotSeat && awaitingAHuman;
  }
  const isCurrentPlayerAi = hotSeatAiSlots[currentPlayer.id] !== undefined;
  return (!myPlayer || myPlayer === currentPlayer.id) && !isCurrentPlayerAi;
}

/**
 * One token per non-bankrupt player (a bankrupt/forfeited player's token
 * comes off the board entirely). `spaceIndex` is passed through exactly as
 * `player.position` — including the negative `PARKING_POSITION` sentinel —
 * since `LoopTrackBoard3D` now natively treats any negative index as
 * "off track", rendering at `offTrackPosition`/`offTrackRotation` (this
 * player's real, dedicated `car-0-<color>` parking spot) instead of a real
 * board space. See docs/hotel-0c-specifikacio.md §5.8.
 */
function buildHotelTokens(
  players: Player[],
  parkingTransforms: (HotelParkingTransform | null)[] | null,
): LoopTrackToken<HotelTokenData>[] {
  return players
    .map((player, index) => ({ player, colorIndex: index % PLAYER_COLORS.length }))
    .filter(({ player }) => !player.bankrupt)
    .map(({ player, colorIndex }) => {
      const parking = parkingTransforms?.[colorIndex] ?? null;
      return {
        // Stable across renders (never regenerated), so LoopTrackBoard3D can
        // animate this token's moves instead of unmounting/remounting it.
        id: player.id,
        spaceIndex: player.position,
        token: { color: PLAYER_COLORS[colorIndex], playerId: player.id },
        offTrackPosition: parking?.position,
        offTrackRotation: parking?.rotation,
      };
    });
}

export interface HotelGamePageProps {
  /** Local mode only — ignored (a throwaway LocalGameTransport is still built but never used) once `transport` is provided. */
  playerNames?: string[];
  /** If omitted, a local LocalGameTransport is created for local (formerly "hot-seat") mode — see docs/dama-0b-multiplayer-specifikacio.md §6.2 and docs/hotel-0b-multiplayer-specifikacio.md. */
  transport?: GameTransport<HotelState, HotelAction>;
  /** Online mode only: which player slot the local client controls — gates PlayerActionWheel's interactivity. */
  myPlayer?: PlayerId;
  /** Local mode only — which of THIS game's player slots (if any) are AI-controlled, and at what difficulty. Ignored (and has no effect) once `transport` is provided, since online AI is already driven server-side by GameRoom. */
  hotSeatAiSlots?: HotSeatAiSlots;
  /** Local mode only — resumes from a previously persisted game (see hotelLocalGamePersistence.ts) instead of a fresh `createInitialState(playerNames)`. Ignored once `transport` is provided. */
  initialGameState?: HotelState;
  /** Local mode only — lets the player abandon the current local game and return to HotelSetupPage's form. Omitted (no "Új játék" affordance shown) in online mode. */
  onRequestNewGame?: () => void;
}

/**
 * Hotel-0a local (hot-seat) vertical, generalized for Hotel-0b online play —
 * mirrors DamaGamePage's role: wires the shared reducer to a transport (local
 * or networked) and renders it, here via LoopTrackBoard3D + PlayerActionWheel
 * instead of GridBoard2D. See docs/hotel-0a-specifikacio.md, docs/hotel-0b-multiplayer-specifikacio.md.
 */
export function HotelGamePage({
  playerNames,
  transport: providedTransport,
  myPlayer,
  hotSeatAiSlots,
  initialGameState,
  onRequestNewGame,
}: HotelGamePageProps) {
  // Local mode only (providedTransport is always set in online mode) — see
  // the persistence effect and LocalGameControls below.
  const isLocalMode = providedTransport === undefined;
  const localTransport = useMemo(
    () => new LocalGameTransport<HotelState, HotelAction>(reducer, initialGameState ?? createInitialState(playerNames ?? [])),
    // Deliberately NOT keyed on initialGameState — that's only ever meant to
    // seed the transport once, at mount (a resumed game), same as playerNames
    // for a fresh one; re-keying on it would just restart the reducer's own
    // state to a stale JSON snapshot every time the persistence effect saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playerNames],
  );
  const loggedLocalTransport = useLocalGameLogger(localTransport, 'hotel');
  const transport = providedTransport ?? loggedLocalTransport;
  const [state, dispatch] = useGameTransport(transport);
  useHotSeatAi(transport, hotSeatAiSlots ?? {});
  useReportFeedbackContext('hotel', state);

  const spaces: LoopTrackSpace<null>[] = useMemo(
    () => state.board.map((space) => ({ id: space.id, data: null })),
    [state.board],
  );

  const splinePositions = useMemo(
    () => computeSplineLoopPositions(spaces.length, HOTEL_BOARD_CONTROL_POINTS),
    [spaces.length],
  );
  // The real model's own baked per-space positions/rotations (see
  // docs/hotel-0c-specifikacio.md §5.7/5.8), once available — falls back to
  // the eyeballed spline estimate (position only, no per-space rotation)
  // until then.
  const realSpaceTransforms = useHotelSpacePositions(spaces.length);
  const boardPositions = realSpaceTransforms?.positions ?? splinePositions;
  const boardRotations = realSpaceTransforms?.rotations;

  // Real, dedicated per-color parking spot (see docs/hotel-0c-specifikacio.md
  // §5.8) — null until the model loads, or per-slot null if that particular
  // car-0-<color> object is missing.
  const parkingTransforms = useHotelParkingPositions();
  const tokens = buildHotelTokens(state.players, parkingTransforms);

  const recentPurchases = useRecentLotPurchases(state.log);
  const recentPurchaseColors = buildRecentPurchaseColors(recentPurchases, state.players);

  const winner = getWinner(state);
  const currentPlayer = state.players[state.currentPlayerIndex];
  // Hot-seat only (hotSeatAiSlots is empty in online mode) — used by
  // StatusChip's "AI gondolkodik…" label. NOT used for the wheel's own
  // interactivity — see isWheelInteractive for why that needs to be a
  // separate, auction-aware check.
  const isCurrentPlayerAi = (hotSeatAiSlots ?? {})[currentPlayer.id] !== undefined;
  // While ANY token is still mid-slide, the wheel locks entirely — a real
  // playtest request (2026-07-28): clicking ahead of the animation looked
  // like nothing happened, but was really queuing an action against a board
  // that hadn't caught up yet.
  const [isTokenAnimating, setIsTokenAnimating] = useState(false);
  const wheelInteractive = isWheelInteractive(state, myPlayer, hotSeatAiSlots ?? {}, currentPlayer) && !isTokenAnimating;

  // Which player's full detail is currently open (via PlayerRoster or a
  // board-token click) — see PlayerInfoModal's doc comment.
  const [inspectedPlayerId, setInspectedPlayerId] = useState<PlayerId | null>(null);

  // Which staircase-space picker is armed, if any — the actual space choice
  // happens by clicking a translucent preview on the board (see
  // `StaircaseCandidateOverlay`), armed from `PlayerActionWheel`'s wheel.
  // Transient UI state, not game state — mirrors PlayerActionWheel's own
  // stack/pending, just lifted up here since only HotelGamePage has access
  // to the 3D board to render/click the candidates on.
  const [staircasePlacement, setStaircasePlacement] = useState<StaircasePlacementMode | null>(null);
  useEffect(() => {
    setStaircasePlacement(null);
  }, [state.currentPlayerIndex, currentPlayer.position]);

  const staircaseCandidates = staircaseCandidatesFor(state, currentPlayer.id, staircasePlacement);

  function handleStaircaseCandidateSelect(candidate: FreeStaircaseCandidate): void {
    dispatch(
      staircasePlacement?.kind === 'paid'
        ? { type: 'BUY_STAIRCASE_RIGHT', lotId: candidate.lotId, spaceId: candidate.spaceId }
        : { type: 'CHOOSE_FREE_STAIRCASE_SPACE', lotId: candidate.lotId, spaceId: candidate.spaceId },
    );
    setStaircasePlacement(null);
  }

  // Resuming across a reload (see hotelLocalGamePersistence.ts) — a real
  // playtest request (2026-07-27): reloading used to always drop back to
  // HotelSetupPage's blank form, losing the game in progress. Re-saves on
  // every dispatch; once the game actually ends, clears it instead — a
  // finished game has nothing left to resume into.
  useEffect(() => {
    if (!isLocalMode) return;
    if (winner) {
      clearPersistedHotelLocalGame();
    } else {
      saveHotelLocalGame({ state, hotSeatAiSlots: hotSeatAiSlots ?? {} });
    }
  }, [isLocalMode, state, hotSeatAiSlots, winner]);

  if (winner) {
    return (
      <div className={styles.page}>
        <h1>Vége a játéknak!</h1>
        <p>Győztes: {winner.name}</p>
        {isLocalMode && onRequestNewGame && <Button onClick={onRequestNewGame}>Új játék</Button>}
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
          renderToken={(data) => (
            <HotelCarToken color={data.color} onClick={() => setInspectedPlayerId(data.playerId)} />
          )}
          positions={boardPositions}
          rotations={boardRotations}
          sceneScale={HOTEL_SCENE_SCALE}
          // The real car-N positions already sit exactly on the real
          // board's surface — no extra hover height needed (see
          // docs/hotel-0c-specifikacio.md §5.8).
          tokenHeightOffset={0}
          // Hotel's rules forbid two tokens ever sharing a space (the
          // engine skips any occupied space, see rules.ts's
          // isPositionOccupied) — the default per-token spread offset would
          // just push each color visibly off its real car-N/car-0-<color>
          // position for no reason (see docs/hotel-0c-specifikacio.md §5.9).
          tokenSpreadRadius={0}
          onAnyTokenAnimatingChange={setIsTokenAnimating}
          background={
            <>
              <HotelBoardModel />
              <HotelBuildingClusters board={state.board} lots={state.lots} recentPurchaseColors={recentPurchaseColors} />
              <StaircaseCandidateOverlay
                candidates={staircaseCandidates}
                board={state.board}
                onSelect={handleStaircaseCandidateSelect}
              />
            </>
          }
        />
        <OwnedLotsPanel state={state} />
        <GameLogPanel state={state} />
        <PlayerActionWheel
          state={state}
          dispatch={dispatch}
          interactive={wheelInteractive}
          staircasePlacement={staircasePlacement}
          onStartStaircasePlacement={setStaircasePlacement}
          onCancelStaircasePlacement={() => setStaircasePlacement(null)}
        />
        <StatusChip state={state} myPlayer={myPlayer} isCurrentPlayerAi={isCurrentPlayerAi} />
        <PlayerRoster state={state} onInspect={setInspectedPlayerId} />
        <PlayerInfoModal state={state} playerId={inspectedPlayerId} onClose={() => setInspectedPlayerId(null)} />
        {isLocalMode && <LocalGameControls gameId="hotel" onRequestNewGame={onRequestNewGame} resumable />}
      </div>
    </div>
  );
}

export default HotelGamePage;
