import { Suspense, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import styles from './GridBoard3D.module.css';

export interface GridBoard3DCell<TCellData> {
  id: string;
  row: number;
  col: number;
  data: TCellData;
}

export interface GridBoard3DProps<TCellData> {
  rows: number;
  cols: number;
  cells: GridBoard3DCell<TCellData>[];
  renderCell: (data: TCellData) => ReactNode;
  onCellClick?: (cellId: string) => void;
  /** Rendered first, behind everything else — same purpose as LoopTrackBoard3D's background prop. */
  background?: ReactNode;
  /** Depth (world units) of the physical board base beneath the cells, so the grid reads as sitting inside its box rather than floating flat. Set to 0 to omit. */
  boardThickness?: number;
  /** Color of the board base. */
  boardColor?: string;
  /**
   * Locks the camera to a static, straight-down view with no player-driven
   * orbit/pan/zoom at all — Ramses's request (2026-08-06): the board stays a
   * real 3D scene (pieces/lighting/perspective unchanged), but the viewing
   * angle itself is fixed, not something the player can spin around.
   * Defaults to the original free-orbit camera, unaffected for any future
   * consumer that doesn't opt in.
   */
  topDownCamera?: boolean;
}

// Exported so a consumer's own `background` content (e.g. a full-board decal)
// can align itself to the exact same per-cell spacing/centering `cellPosition`
// uses internally — see docs/ramses-0a-specifikacio.md §8.1's frame.png overlay.
export const CELL_SIZE = 1.2;
const BOARD_MARGIN = 0.6;
const DEFAULT_BOARD_THICKNESS = 0.5;
const DEFAULT_BOARD_COLOR = '#2b2b2b';

function cellPosition(row: number, col: number, rows: number, cols: number): [number, number, number] {
  const offsetX = ((cols - 1) * CELL_SIZE) / 2;
  const offsetZ = ((rows - 1) * CELL_SIZE) / 2;
  return [col * CELL_SIZE - offsetX, 0, row * CELL_SIZE - offsetZ];
}

/**
 * Purely presentational 3D grid renderer — the game-agnostic sibling of
 * GridBoard2D (cluster B, rectangular grid) and LoopTrackBoard3D (cluster C,
 * loop track), for games whose board IS a rectangular grid but need a real
 * 3D scene with genuinely clickable cells. Unlike LoopTrackBoard3D's
 * optional `onSpaceClick` (never wired up by its only consumer, Hotel, which
 * uses a separate screen-space overlay menu instead), this component's
 * `onCellClick` is the game's ONLY interaction surface for its first
 * consumer, Ramses — see docs/ramses-0a-specifikacio.md §5. React Three
 * Fiber's `onClick` on a mesh/group is real 3D raycasting, not a DOM event —
 * no hand-written raycasting code needed here.
 */
export function GridBoard3D<TCellData>({
  rows,
  cols,
  cells,
  renderCell,
  onCellClick,
  background,
  boardThickness = DEFAULT_BOARD_THICKNESS,
  boardColor = DEFAULT_BOARD_COLOR,
  topDownCamera = false,
}: GridBoard3DProps<TCellData>) {
  // Tall enough to frame the whole grid (scales with its longer side) plus a
  // little margin — the tiny Z epsilon avoids the camera sitting EXACTLY on
  // the polar axis, a known degenerate case for OrbitControls' spherical math.
  const topDownHeight = Math.max(rows, cols) * CELL_SIZE * 1.35;
  const cameraProps = topDownCamera ? { position: [0, topDownHeight, 0.0001] as const, fov: 45 } : { position: [0, 9, 7] as const, fov: 45 };

  return (
    <Canvas className={styles.canvas} camera={cameraProps}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      {/*
        `enabled={false}` still lets OrbitControls run its own initial
        target/position math once (orienting the camera exactly at the
        board center), it just stops listening for further pointer input —
        more robust than hand-rolling a lookAt, reusing the same math the
        free-orbit camera already relies on.
      */}
      {topDownCamera ? (
        <OrbitControls enabled={false} />
      ) : (
        <OrbitControls enablePan={false} minDistance={4} maxDistance={18} maxPolarAngle={Math.PI / 2.2} />
      )}
      <Suspense fallback={null}>{background}</Suspense>
      {boardThickness > 0 && (
        <mesh position={[0, -boardThickness / 2, 0]}>
          <boxGeometry args={[cols * CELL_SIZE + BOARD_MARGIN, boardThickness, rows * CELL_SIZE + BOARD_MARGIN]} />
          <meshStandardMaterial color={boardColor} />
        </mesh>
      )}
      {cells.map((cell) => (
        <group
          key={cell.id}
          position={cellPosition(cell.row, cell.col, rows, cols)}
          onClick={(event) => {
            event.stopPropagation();
            onCellClick?.(cell.id);
          }}
        >
          {renderCell(cell.data)}
        </group>
      ))}
    </Canvas>
  );
}
