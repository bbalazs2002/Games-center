import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { a, useSpring } from '@react-spring/three';
import { Vector3 } from 'three';
import { computeLoopPositions } from './computeLoopPositions';
import styles from './LoopTrackBoard3D.module.css';

export interface LoopTrackSpace<TSpaceData> {
  id: string;
  data: TSpaceData;
}

export interface LoopTrackToken<TToken> {
  /** Stable identity (e.g. a playerId) — MUST stay the same across renders for the same token, or its move can't be animated (React would unmount/remount it instead of interpolating). */
  id: string;
  spaceIndex: number;
  token: TToken;
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
  /** Rendered first, behind everything else — e.g. a textured plane/box matching the real board's artwork. Purely presentational, same as everything else this component takes. */
  background?: ReactNode;
}

function inwardDirection(position: { x: number; z: number }): InwardDirection {
  const length = Math.hypot(position.x, position.z) || 1;
  return [-position.x / length, -position.z / length];
}

/** Small deterministic spread so same-space tokens don't fully overlap. */
function tokenOffset(index: number): [number, number] {
  const angle = (index / 4) * Math.PI * 2;
  const radius = 0.3;
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

interface AnimatedTokenProps {
  spaceIndex: number;
  positions: Vector3[];
  offset: [number, number];
  children: ReactNode;
}

/**
 * One token's group, animated with @react-spring/three — hops through every
 * intermediate board space between its previous and current index (not a
 * straight line across the board) whenever `spaceIndex` changes. Keyed by
 * the token's stable `id` at the call site, so React updates (never
 * remounts) this across a move, letting the spring actually interpolate.
 */
function AnimatedToken({ spaceIndex, positions, offset, children }: AnimatedTokenProps) {
  const previousIndexRef = useRef(spaceIndex);
  const [offsetX, offsetZ] = offset;

  function groupPositionAt(index: number): [number, number, number] {
    const base = positions[index];
    return [base.x + offsetX, base.y + 0.5, base.z + offsetZ];
  }

  const [spring, api] = useSpring(() => ({ position: groupPositionAt(spaceIndex) }));

  useEffect(() => {
    const from = previousIndexRef.current;
    previousIndexRef.current = spaceIndex;
    if (from === spaceIndex) return;
    const path = stepPath(from, spaceIndex, positions.length);
    void api.start({
      to: async (next) => {
        for (const index of path) {
          await next({ position: groupPositionAt(index) });
        }
      },
      config: { tension: 210, friction: 24 },
    });
    // groupPositionAt/positions are stable for the render in which the effect fires — only spaceIndex should retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceIndex]);

  // @react-spring/three's SpringValue and @react-three/fiber's own `position`
  // JSX typing don't quite line up in the currently installed versions (a
  // known cross-package typing friction, not a runtime issue — this is
  // react-spring's own documented main use case) — cast at this one call site.
  return <a.group position={spring.position as unknown as [number, number, number]}>{children}</a.group>;
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
  background,
}: LoopTrackBoard3DProps<TSpaceData, TToken>) {
  const generatedPositions = useMemo(() => computeLoopPositions(spaces.length), [spaces.length]);
  const positions = customPositions ?? generatedPositions;

  return (
    <Canvas className={styles.canvas} camera={{ position: [0, 14, 11], fov: 50 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      <OrbitControls enablePan={false} minDistance={6} maxDistance={24} maxPolarAngle={Math.PI / 2.2} />
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
      {tokens.map(({ id, spaceIndex, token }, tokenIndex) => (
        <AnimatedToken key={id} spaceIndex={spaceIndex} positions={positions} offset={tokenOffset(tokenIndex)}>
          {renderToken(token)}
        </AnimatedToken>
      ))}
    </Canvas>
  );
}
