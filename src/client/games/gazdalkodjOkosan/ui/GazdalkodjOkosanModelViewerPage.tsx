import { Suspense, useCallback, useMemo, useState, type CSSProperties } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import { Euler, Vector3, type Object3D } from 'three';
import { cloneWithTint } from '../../../renderers/models/materialTint';
import { useGLTFScene } from '../../../renderers/models/useGLTFScene';
import {
  GAZDALKODJ_BOARD_DEPTH,
  GAZDALKODJ_BOARD_TEXTURE_URL,
  GAZDALKODJ_BOARD_WIDTH,
  GAZDALKODJ_PAWN_OBJECT_NAME,
  GAZDALKODJ_PAWN_URL,
  GAZDALKODJ_PLAYER_COLORS,
} from './gazdalkodjOkosanAssets';
import {
  GAZDALKODJ_PAWN_SCALE,
  GAZDALKODJ_SPACE_POSITIONS_BY_SLOT,
  GAZDALKODJ_SPACE_ROTATIONS_BY_SLOT,
} from './gazdalkodjOkosanBoardLayout.generated';

/**
 * Raw-data verification viewer (Gazdálkodj okosan-0c) — renders the real
 * board texture as a flat plane plus ALL 6 player-slot lanes at ALL 42
 * spaces at once (252 pawns total), using the extracted, author-baked
 * positions/rotations directly (see
 * scripts/extract-gazdalkodj-okosan-board-positions.mjs and
 * feedback_loop_track_baked_positions in project memory for why baked data,
 * not LoopTrackBoard3D's procedural tokenSpreadRadius). The point is purely
 * visual sanity-checking before wiring this into the real game: do the 42
 * anchors trace the board's real perimeter, do same-space lanes stay inside
 * their own cell without drifting into a neighbor, is the board texture the
 * right size/orientation. Not the final in-game renderer — the real board
 * only ever shows 2-6 pawns (one per active player), animated, via
 * LoopTrackBoard3D.
 */

const BOARD_THICKNESS = 0.05;

interface InspectedInfo {
  name: string;
  worldPosition: [number, number, number];
  localPosition: [number, number, number];
  localRotationDeg: [number, number, number];
  localScale: [number, number, number];
}

function findNamedAncestor(object: Object3D): Object3D {
  let current: Object3D | null = object;
  while (current && !current.name && current.parent) current = current.parent;
  return current ?? object;
}

function describeObject(object: Object3D): InspectedInfo {
  const target = findNamedAncestor(object);
  const worldPosition = new Vector3();
  target.getWorldPosition(worldPosition);
  const euler = new Euler().setFromQuaternion(target.quaternion, 'XYZ');
  return {
    name: target.name || '(névtelen)',
    worldPosition: worldPosition.toArray(),
    localPosition: target.position.toArray(),
    localRotationDeg: [(euler.x * 180) / Math.PI, (euler.y * 180) / Math.PI, (euler.z * 180) / Math.PI],
    localScale: target.scale.toArray(),
  };
}

function BoardBackground() {
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

interface PawnAtProps {
  source: Object3D;
  slot: number;
  space: number;
  onInspect: (info: InspectedInfo) => void;
}

/**
 * One pawn clone, tinted per slot and placed at that slot's own baked anchor
 * for `space`. Clones the NAMED node (`figure-1-00`), not the outer scene
 * wrapper `useGLTFScene` returns — cloning the wrapper and overwriting ITS
 * transform would leave the found child's own already-baked
 * position/scale nested underneath, composing into a wildly wrong (and,
 * for scale, doubled-down: 0.02 x 0.02) result. `GLTFSceneObject.tsx` avoids
 * this the same way, via `scene.getObjectByName`.
 */
function PawnAt({ source, slot, space, onInspect }: PawnAtProps) {
  const object = useMemo(() => {
    const named = source.getObjectByName(GAZDALKODJ_PAWN_OBJECT_NAME) ?? source;
    const clone = cloneWithTint(named, GAZDALKODJ_PLAYER_COLORS[slot]);
    const [x, y, z] = GAZDALKODJ_SPACE_POSITIONS_BY_SLOT[slot][space];
    const [qx, qy, qz, qw] = GAZDALKODJ_SPACE_ROTATIONS_BY_SLOT[slot][space];
    clone.position.set(x, y, z);
    clone.quaternion.set(qx, qy, qz, qw);
    clone.scale.setScalar(GAZDALKODJ_PAWN_SCALE);
    clone.name = `slot-${slot + 1}-space-${space}`;
    return clone;
  }, [source, slot, space]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onInspect(describeObject(event.object));
    },
    [onInspect],
  );

  // dispose={null}: `object`'s geometry/material clones point back into the
  // shared, cached useGLTFScene scene graph (same reasoning as
  // GLTFSceneObject.tsx) — with 252 instances sharing one cached source,
  // auto-dispose on any single unmount would break every other instance.
  return <primitive object={object} onClick={handleClick} dispose={null} />;
}

function AllPawnsScene({ onInspect }: { onInspect: (info: InspectedInfo) => void }) {
  const scene = useGLTFScene(GAZDALKODJ_PAWN_URL);
  if (!scene) return null;

  return (
    <>
      <BoardBackground />
      {GAZDALKODJ_SPACE_POSITIONS_BY_SLOT.map((_, slot) =>
        Array.from({ length: 42 }, (_, space) => (
          <PawnAt key={`${slot}-${space}`} source={scene} slot={slot} space={space} onInspect={onInspect} />
        )),
      )}
    </>
  );
}

const PANEL_STYLE: CSSProperties = {
  position: 'absolute',
  padding: '10px 14px',
  background: 'rgba(10, 12, 20, 0.85)',
  color: '#e8ecf4',
  fontFamily: '"Cascadia Code", "Consolas", monospace',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.15)',
  lineHeight: 1.6,
};

export function GazdalkodjOkosanModelViewerPage() {
  const [inspected, setInspected] = useState<InspectedInfo | null>(null);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0a0c14' }}>
      <Canvas camera={{ position: [0, 6, 5], fov: 50, near: 0.01, far: 2000 }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 6, 3]} intensity={1.5} />
        <directionalLight position={[-3, 2, -3]} intensity={0.6} />
        <axesHelper args={[2]} />
        <OrbitControls enablePan makeDefault minDistance={0.5} maxDistance={100} />
        <Suspense fallback={null}>
          <AllPawnsScene onInspect={setInspected} />
        </Suspense>
      </Canvas>

      <div style={{ ...PANEL_STYLE, top: 12, left: 12, maxWidth: 480 }}>
        <div>
          <strong>Gazdálkodj okosan — tábla + mind a 6 sáv, mind a 42 mezőn (252 bábu)</strong>
        </div>
        <div style={{ marginTop: 4, opacity: 0.85 }}>
          A tábla-textúra ({GAZDALKODJ_BOARD_WIDTH}×{GAZDALKODJ_BOARD_DEPTH} egység) és a nyers <code>full-board.glb</code>
          -ből kinyert, kézzel authorolt sáv-pozíciók (nem szintetikus/számított elhelyezés).
        </div>
        <div style={{ marginTop: 4, opacity: 0.85 }}>
          Tengelyek: <span style={{ color: '#f66' }}>piros = X</span>, <span style={{ color: '#66f' }}>kék = Z</span>.
        </div>
        <div style={{ marginTop: 4, opacity: 0.85 }}>
          Színek (sávonként): {GAZDALKODJ_PLAYER_COLORS.map((c) => (
            <span key={c} style={{ color: c }}>
              ■{' '}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 4, opacity: 0.85 }}>Kattints egy bábura az adatai megjelenítéséhez.</div>
      </div>

      {inspected && (
        <div style={{ ...PANEL_STYLE, bottom: 12, left: 12, color: '#8f8', whiteSpace: 'pre' }}>
          {`name:        ${inspected.name}
world pos:   [${inspected.worldPosition.map((n) => n.toFixed(3)).join(', ')}]
local pos:   [${inspected.localPosition.map((n) => n.toFixed(3)).join(', ')}]
local rot°:  [${inspected.localRotationDeg.map((n) => n.toFixed(1)).join(', ')}]
local scale: [${inspected.localScale.map((n) => n.toFixed(3)).join(', ')}]`}
        </div>
      )}
    </div>
  );
}

export default GazdalkodjOkosanModelViewerPage;
