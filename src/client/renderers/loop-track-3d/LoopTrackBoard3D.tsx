import { Suspense, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
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
  /**
   * Fires whenever the set of currently-mid-slide tokens goes from empty to
   * non-empty or back — lets a game lock player input while ANY token is
   * still animating (see docs/hotel-0c-specifikacio.md §5.11.1 — a real
   * playtest request, "ne lehessen semmit csinálni amíg a lépés-animáció
   * tart"). Deliberately game-agnostic: this component only reports the
   * fact, a game decides what "locked" means for its own UI.
   */
  onAnyTokenAnimatingChange?: (animating: boolean) => void;
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

/**
 * Every board index walked from `from` to `to`, stepping +1 with wraparound.
 * A negative `from` (e.g. Hotel's "parkoló" sentinel, meaning the token
 * hasn't entered the track yet) enters the track at space 0 first, then
 * walks from there like any other move — a single straight-line jump
 * straight to `to` (the old behavior) skipped the per-space hop animation
 * entirely for every player's very first move, reading as an unanimated
 * "slide" instead of the same stepped motion every later move already has
 * (a real playtest report, 2026-07-30). The one remaining straight-line
 * hop — off-track parking spot to space 0 — is unavoidable (parking isn't
 * itself a point on the track) and reads fine as "pulling onto the road."
 */
function stepPath(from: number, to: number, boardLength: number): number[] {
  if (from < 0) return to === 0 ? [0] : [0, ...stepPath(0, to, boardLength)];
  if (from === to) return [to];
  const path: number[] = [];
  let index = from;
  for (let i = 0; i < boardLength && index !== to; i++) {
    index = (index + 1) % boardLength;
    path.push(index);
  }
  return path.length > 0 ? path : [to];
}

const IDENTITY_QUATERNION = new Quaternion();

/**
 * `q` and `-q` represent the IDENTICAL rotation, but react-spring
 * interpolates a quaternion tuple component-wise (not via SLERP) — animating
 * between two target quaternions that happen to have opposite sign takes the
 * long way around (visibly a 360°+ spin before settling on the correct final
 * orientation, confirmed via a real playtest, 2026-07-29), even though the
 * start/end orientations themselves are correct. Flipping `target`'s sign to
 * match whichever the spring is already closer to (dot product >= 0) picks
 * the equivalent representation that keeps this hop on the shortest path,
 * without switching interpolation strategies.
 */
function alignQuaternionSign(
  target: [number, number, number, number],
  reference: [number, number, number, number],
): [number, number, number, number] {
  const dot = target[0] * reference[0] + target[1] * reference[1] + target[2] * reference[2] + target[3] * reference[3];
  if (dot >= 0) return target;
  return [-target[0], -target[1], -target[2], -target[3]];
}

interface AnimatedTokenProps {
  id: string;
  spaceIndex: number;
  positions: Vector3[];
  rotations?: Quaternion[];
  offset: [number, number];
  tokenHeightOffset: number;
  offTrackPosition?: Vector3;
  offTrackRotation?: Quaternion;
  onAnimatingChange?: (id: string, animating: boolean) => void;
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
  id,
  spaceIndex,
  positions,
  rotations,
  offset,
  tokenHeightOffset,
  offTrackPosition,
  offTrackRotation,
  onAnimatingChange,
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
    // Anchored to the spring's ACTUAL current value (not the logical "from"
    // node's own baked quaternion) — matters if this move interrupts an
    // already-in-flight animation, since react-spring continues from
    // wherever the spring physically is, not from `from`.
    let lastQuaternion = spring.quaternion.get() as [number, number, number, number];
    onAnimatingChange?.(id, true);
    // api.start() returns one AsyncResult (Promise) PER controlled spring —
    // just one here, but Promise.all keeps this correct regardless.
    void Promise.all(
      api.start({
        to: async (next) => {
          for (const index of path) {
            const targetQuaternion = alignQuaternionSign(groupQuaternionAt(index), lastQuaternion);
            lastQuaternion = targetQuaternion;
            await next({ position: groupPositionAt(index), quaternion: targetQuaternion });
          }
        },
        config: { tension: 210, friction: 24 },
      }),
    ).then(() => onAnimatingChange?.(id, false));
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
  onAnyTokenAnimatingChange,
}: LoopTrackBoard3DProps<TSpaceData, TToken>) {
  const generatedPositions = useMemo(() => computeLoopPositions(spaces.length), [spaces.length]);
  const positions = customPositions ?? generatedPositions;
  const resolvedTokenHeightOffset = tokenHeightOffset ?? 0.5 * sceneScale;
  const resolvedTokenSpreadRadius = tokenSpreadRadius ?? 0.3 * sceneScale;

  // Tracks WHICH tokens are currently animating (not just a count), so two
  // overlapping moves don't fire a spurious "stopped" the instant the first
  // of them finishes while the second is still going.
  const animatingTokenIdsRef = useRef<Set<string>>(new Set());
  const handleTokenAnimatingChange = useCallback(
    (id: string, animating: boolean) => {
      const ids = animatingTokenIdsRef.current;
      const wasAnyAnimating = ids.size > 0;
      if (animating) ids.add(id);
      else ids.delete(id);
      const isAnyAnimating = ids.size > 0;
      if (wasAnyAnimating !== isAnyAnimating) onAnyTokenAnimatingChange?.(isAnyAnimating);
    },
    [onAnyTokenAnimatingChange],
  );

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
          id={id}
          spaceIndex={spaceIndex}
          positions={positions}
          rotations={rotations}
          offset={tokenOffset(tokenIndex, resolvedTokenSpreadRadius)}
          tokenHeightOffset={resolvedTokenHeightOffset}
          offTrackPosition={offTrackPosition}
          offTrackRotation={offTrackRotation}
          onAnimatingChange={handleTokenAnimatingChange}
        >
          {renderToken(token)}
        </AnimatedToken>
      ))}
    </Canvas>
  );
}
