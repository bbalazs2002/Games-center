import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { a, useSpring } from '@react-spring/three';
import { Quaternion, Vector3 } from 'three';
import { computeLoopPositions } from './computeLoopPositions';
import styles from './LoopTrackBoard3D.module.css';

export interface LoopTrackSpace<TSpaceData> {
  id: string;
  data: TSpaceData;
}

export interface LoopTrackToken<TToken> {
  /** Stable identity (e.g. a playerId) — MUST stay the same across renders for the same token, or its move can't be animated (React would unmount/remount it instead of interpolating). */
  id: string;
  /** Negative means "not yet placed on the track" (e.g. Hotel's "parkoló" sentinel) — renders at `offTrackPosition`/`offTrackRotation` instead of `positions`/`rotations`. */
  spaceIndex: number;
  token: TToken;
  /** Required when `spaceIndex` is negative — where to render the token instead of `positions[spaceIndex]`. Ignored when `spaceIndex >= 0`. */
  offTrackPosition?: Vector3;
  /** Optional orientation to use together with `offTrackPosition`. Defaults to no rotation (identity) when omitted. */
  offTrackRotation?: Quaternion;
}

/** Unit XZ vector pointing from a space toward the loop's center — lets a game place content beside the track, on the inside or outside. */
export type InwardDirection = [number, number];

export interface LoopTrackBoard3DProps<TSpaceData, TToken> {
  spaces: LoopTrackSpace<TSpaceData>[];
  renderSpace: (data: TSpaceData, inward: InwardDirection) => ReactNode;
  tokens: LoopTrackToken<TToken>[];
  renderToken: (token: TToken) => ReactNode;
  onSpaceClick?: (spaceId: string) => void;
  /** Overrides the generated rounded-rectangle positions — e.g. computeSplineLoopPositions for a game with a real, irregular board outline. Must have one entry per space. */
  positions?: Vector3[];
  /** Per-space orientation, parallel to `positions` — a token visiting space `i` faces this rotation while it's there. Omit for no per-space facing (tokens keep whatever rotation `renderToken` itself gives them). */
  rotations?: Quaternion[];
  /** Rendered first, behind everything else — e.g. a textured plane/box matching the real board's artwork. Purely presentational, same as everything else this component takes. */
  background?: ReactNode;
  /**
   * Multiplies every internal, otherwise-hardcoded distance this component
   * uses on its own (camera position, OrbitControls min/max distance, the
   * small per-token spread offset) — default `1` keeps today's behavior
   * unchanged for any game using the generated placeholder positions. A game
   * supplying `positions` in a much larger/smaller native coordinate space
   * (e.g. Hotel's real, unscaled Blender-authored model — see
   * docs/hotel-0c-specifikacio.md §5.7) passes its own scale here instead of
   * shrinking/growing its `positions` data to fit this component's defaults.
   */
  sceneScale?: number;
  /**
   * Extra height added on top of a token's own space/off-track position —
   * default `0.5 * sceneScale` (a hover offset that made sense for
   * placeholder-height spaces). Pass `0` when the position data's own Y
   * already puts tokens exactly where they should visually sit (e.g. Hotel's
   * real `car-N` positions, which already sit ON the real board's surface).
   */
  tokenHeightOffset?: number;
  /**
   * Radius of the small deterministic spread applied so same-space tokens
   * don't fully overlap — default `0.3 * sceneScale`, for a game where
   * multiple tokens CAN legally share one space (e.g. a future
   * Monopoly/Gazdálkodj okosan). Pass `0` when the game's rules make that
   * impossible (e.g. Hotel — the engine skips any occupied space, see
   * `rules.ts`'s `isPositionOccupied`, so every token always has a whole
   * space to itself) — otherwise the offset just pushes the token visibly
   * off its real, correctly-positioned spot for no reason.
   */
  tokenSpreadRadius?: number;
}

function inwardDirection(position: { x: number; z: number }): InwardDirection {
  const length = Math.hypot(position.x, position.z) || 1;
  return [-position.x / length, -position.z / length];
}

/** Small deterministic spread so same-space tokens don't fully overlap. */
function tokenOffset(index: number, radius: number): [number, number] {
  const angle = (index / 4) * Math.PI * 2;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

/** Every board index walked from `from` to `to`, stepping +1 with wraparound — a negative `from` (e.g. Hotel's "parkoló" sentinel) means there's no real path to walk, just appear at `to` directly. */
function stepPath(from: number, to: number, boardLength: number): number[] {
  if (from < 0 || from === to) return [to];
  const path: number[] = [];
  let index = from;
  for (let i = 0; i < boardLength && index !== to; i++) {
    index = (index + 1) % boardLength;
    path.push(index);
  }
  return path.length > 0 ? path : [to];
}

const IDENTITY_QUATERNION = new Quaternion();

interface AnimatedTokenProps {
  spaceIndex: number;
  positions: Vector3[];
  rotations?: Quaternion[];
  offset: [number, number];
  tokenHeightOffset: number;
  offTrackPosition?: Vector3;
  offTrackRotation?: Quaternion;
  children: ReactNode;
}

/**
 * One token's group, animated with @react-spring/three — hops through every
 * intermediate board space between its previous and current index (not a
 * straight line across the board) whenever `spaceIndex` changes, and
 * (when `rotations` is supplied) turns to face each space's own orientation
 * along the way. Keyed by the token's stable `id` at the call site, so React
 * updates (never remounts) this across a move, letting the spring actually
 * interpolate.
 */
function AnimatedToken({
  spaceIndex,
  positions,
  rotations,
  offset,
  tokenHeightOffset,
  offTrackPosition,
  offTrackRotation,
  children,
}: AnimatedTokenProps) {
  const previousIndexRef = useRef(spaceIndex);
  const [offsetX, offsetZ] = offset;

  function groupPositionAt(index: number): [number, number, number] {
    const base = index >= 0 ? positions[index] : offTrackPosition;
    if (!base) return [offsetX, tokenHeightOffset, offsetZ];
    return [base.x + offsetX, base.y + tokenHeightOffset, base.z + offsetZ];
  }

  function groupQuaternionAt(index: number): [number, number, number, number] {
    const rotation = (index >= 0 ? rotations?.[index] : offTrackRotation) ?? IDENTITY_QUATERNION;
    return rotation.toArray() as [number, number, number, number];
  }

  const [spring, api] = useSpring(() => ({
    position: groupPositionAt(spaceIndex),
    quaternion: groupQuaternionAt(spaceIndex),
  }));

  useEffect(() => {
    const from = previousIndexRef.current;
    previousIndexRef.current = spaceIndex;
    if (from === spaceIndex) {
      // Same index as last render — nothing to animate through, but the
      // resolved position/rotation for it may have just become available
      // (e.g. the real model, or this token's real parking spot, finished
      // loading after the token's very first render used a fallback) —
      // snap instantly to the now-correct value instead of leaving the
      // token stuck at whatever it first rendered with.
      api.set({ position: groupPositionAt(spaceIndex), quaternion: groupQuaternionAt(spaceIndex) });
      return;
    }
    const path = stepPath(from, spaceIndex, positions.length);
    void api.start({
      to: async (next) => {
        for (const index of path) {
          await next({ position: groupPositionAt(index), quaternion: groupQuaternionAt(index) });
        }
      },
      config: { tension: 210, friction: 24 },
    });
    // groupPositionAt/groupQuaternionAt close over positions/rotations/offTrackPosition/offTrackRotation, so those are the real dependencies alongside spaceIndex.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceIndex, positions, rotations, offTrackPosition, offTrackRotation]);

  // @react-spring/three's SpringValue and @react-three/fiber's own
  // `position`/`quaternion` JSX typing don't quite line up in the currently
  // installed versions (a known cross-package typing friction, not a runtime
  // issue — this is react-spring's own documented main use case) — cast at
  // this one call site.
  return (
    <a.group
      position={spring.position as unknown as [number, number, number]}
      quaternion={spring.quaternion as unknown as [number, number, number, number]}
    >
      {children}
    </a.group>
  );
}

/**
 * Purely presentational 3D board renderer, shared across every loop-track
 * game (cluster C: Hotel, later Gazdálkodj okosan/Monopoly) — mirrors
 * GridBoard2D's role for the grid-based cluster B games. Knows nothing about
 * game rules; only renders what it's given and reports clicks. See
 * docs/hotel-0a-specifikacio.md §5, docs/hotel-animacio-specifikacio.md §3.1.
 */
export function LoopTrackBoard3D<TSpaceData, TToken>({
  spaces,
  renderSpace,
  tokens,
  renderToken,
  onSpaceClick,
  positions: customPositions,
  rotations,
  background,
  sceneScale = 1,
  tokenHeightOffset,
  tokenSpreadRadius,
}: LoopTrackBoard3DProps<TSpaceData, TToken>) {
  const generatedPositions = useMemo(() => computeLoopPositions(spaces.length), [spaces.length]);
  const positions = customPositions ?? generatedPositions;
  const resolvedTokenHeightOffset = tokenHeightOffset ?? 0.5 * sceneScale;
  const resolvedTokenSpreadRadius = tokenSpreadRadius ?? 0.3 * sceneScale;

  return (
    <Canvas className={styles.canvas} camera={{ position: [0, 14 * sceneScale, 11 * sceneScale], fov: 50 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      <OrbitControls
        enablePan={false}
        minDistance={6 * sceneScale}
        maxDistance={24 * sceneScale}
        maxPolarAngle={Math.PI / 2.2}
      />
      <Suspense fallback={null}>{background}</Suspense>
      {spaces.map((space, index) => (
        <group
          key={space.id}
          position={positions[index]}
          onClick={(event) => {
            event.stopPropagation();
            onSpaceClick?.(space.id);
          }}
        >
          {renderSpace(space.data, inwardDirection(positions[index]))}
        </group>
      ))}
      {tokens.map(({ id, spaceIndex, token, offTrackPosition, offTrackRotation }, tokenIndex) => (
        <AnimatedToken
          key={id}
          spaceIndex={spaceIndex}
          positions={positions}
          rotations={rotations}
          offset={tokenOffset(tokenIndex, resolvedTokenSpreadRadius)}
          tokenHeightOffset={resolvedTokenHeightOffset}
          offTrackPosition={offTrackPosition}
          offTrackRotation={offTrackRotation}
        >
          {renderToken(token)}
        </AnimatedToken>
      ))}
    </Canvas>
  );
}
