import { useTexture } from '@react-three/drei';
import { GAZDALKODJ_BOARD_DEPTH, GAZDALKODJ_BOARD_TEXTURE_URL, GAZDALKODJ_BOARD_WIDTH } from './gazdalkodjOkosanAssets';

const BOARD_THICKNESS = 0.05;

/**
 * Thin, board.jpg-textured box (top face only) matching the real board's own
 * 5x3.6 aspect (see docs/gazdalkodj-okosan-0c-vizual-specifikacio.md §5) —
 * Hotel's BoardBackground pattern (HotelGamePage.tsx), just without the
 * multi-object building/staircase overlay this game doesn't have.
 */
export function GazdalkodjOkosanBoardBackground() {
  const texture = useTexture(GAZDALKODJ_BOARD_TEXTURE_URL);
  return (
    <mesh position={[0, -BOARD_THICKNESS / 2, 0]}>
      <boxGeometry args={[GAZDALKODJ_BOARD_WIDTH, BOARD_THICKNESS, GAZDALKODJ_BOARD_DEPTH]} />
      <meshStandardMaterial attach="material-0" color="#1a1a1a" />
      <meshStandardMaterial attach="material-1" color="#1a1a1a" />
      <meshStandardMaterial attach="material-2" map={texture} />
      <meshStandardMaterial attach="material-3" color="#1a1a1a" />
      <meshStandardMaterial attach="material-4" color="#1a1a1a" />
      <meshStandardMaterial attach="material-5" color="#1a1a1a" />
    </mesh>
  );
}
