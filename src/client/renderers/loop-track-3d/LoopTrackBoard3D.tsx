import { useMemo, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { computeLoopPositions } from './computeLoopPositions';
import styles from './LoopTrackBoard3D.module.css';

export interface LoopTrackSpace<TSpaceData> {
  id: string;
  data: TSpaceData;
}

export interface LoopTrackToken<TToken> {
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

/**
 * Purely presentational 3D board renderer, shared across every loop-track
 * game (cluster C: Hotel, later Gazdálkodj okosan/Monopoly) — mirrors
 * GridBoard2D's role for the grid-based cluster B games. Knows nothing about
 * game rules; only renders what it's given and reports clicks. See
 * docs/hotel-0a-specifikacio.md §5.
 */
export function LoopTrackBoard3D<TSpaceData, TToken>({
  spaces,
  renderSpace,
  tokens,
  renderToken,
  onSpaceClick,
}: LoopTrackBoard3DProps<TSpaceData, TToken>) {
  const positions = useMemo(() => computeLoopPositions(spaces.length), [spaces.length]);

  return (
    <Canvas className={styles.canvas} camera={{ position: [0, 14, 11], fov: 50 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      <OrbitControls enablePan={false} minDistance={6} maxDistance={24} maxPolarAngle={Math.PI / 2.2} />
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
      {tokens.map(({ spaceIndex, token }, tokenIndex) => {
        const base = positions[spaceIndex];
        const [offsetX, offsetZ] = tokenOffset(tokenIndex);
        return (
          <group key={`${spaceIndex}-${tokenIndex}`} position={[base.x + offsetX, base.y + 0.5, base.z + offsetZ]}>
            {renderToken(token)}
          </group>
        );
      })}
    </Canvas>
  );
}
