import { Suspense, useCallback, useState, type CSSProperties } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Euler, Vector3, type Object3D } from 'three';
import { useGLTFScene } from '../../../renderers/models/useGLTFScene';
import { HOTEL_MODEL_URL } from './hotelModelAssets';

/**
 * Raw, uncorrected `.glb` inspector — renders exactly what `full-board.glb`
 * contains, with NO rotation/position/scale correction of any kind applied
 * (unlike `HotelModelObject`/`HotelGamePage.tsx`, which apply
 * `correctBakedRotation`). Built after three rounds of a rotation fix that
 * each looked right in my own testing but turned out wrong once checked
 * against a harder live case — the user asked to step back and see the raw
 * loaded data directly, to rule out a loading-stage bug before trusting any
 * more correction logic. See docs/hotel-0c-specifikacio.md §5.7.
 *
 * Free-orbit camera (no polar-angle limit, unlike the game's own
 * `LoopTrackBoard3D`), an axes helper (red=X, green=Y/up, blue=Z) and a grid
 * for scale/orientation reference, and click-to-inspect (shows the clicked
 * object's exact name/position/rotation/scale in the corner panel) so the
 * user can directly cross-check any object against their own Blender scene.
 */

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

function RawGltfScene({ onInspect }: { onInspect: (info: InspectedInfo) => void }) {
  const scene = useGLTFScene(HOTEL_MODEL_URL);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onInspect(describeObject(event.object));
    },
    [onInspect],
  );

  if (!scene) return null;
  // The scene is rendered completely unmodified — no clone, no correction —
  // exactly the cached, loaded result of GLTFLoader against full-board.glb.
  return <primitive object={scene} onClick={handleClick} />;
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

export function HotelModelViewerPage() {
  const [inspected, setInspected] = useState<InspectedInfo | null>(null);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0a0c14' }}>
      <Canvas camera={{ position: [400, 400, 400], fov: 50, near: 0.1, far: 20000 }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[300, 600, 300]} intensity={1.5} />
        <directionalLight position={[-300, 200, -300]} intensity={0.6} />
        <axesHelper args={[300]} />
        <gridHelper args={[1000, 20]} />
        <OrbitControls enablePan makeDefault minDistance={1} maxDistance={8000} />
        <Suspense fallback={null}>
          <RawGltfScene onInspect={setInspected} />
        </Suspense>
      </Canvas>

      <div style={{ ...PANEL_STYLE, top: 12, left: 12, maxWidth: 460 }}>
        <div>
          <strong>Hotel .glb — nyers, korrekció nélküli nézegető</strong>
        </div>
        <div style={{ marginTop: 4, opacity: 0.85 }}>
          Semmi nincs elforgatva/eltolva/átméretezve — pontosan az van betöltve, ami a fájlban van.
        </div>
        <div style={{ marginTop: 4, opacity: 0.85 }}>
          Tengelyek: <span style={{ color: '#f66' }}>piros = X</span>,{' '}
          <span style={{ color: '#6f6' }}>zöld = Y (fel)</span>, <span style={{ color: '#66f' }}>kék = Z</span>.
          Rács: 1000×1000 egység, 50-es osztásban.
        </div>
        <div style={{ marginTop: 4, opacity: 0.85 }}>Kattints egy objektumra az adatai megjelenítéséhez.</div>
      </div>

      {inspected && (
        <div style={{ ...PANEL_STYLE, bottom: 12, left: 12, color: '#8f8', whiteSpace: 'pre' }}>
          {`name:        ${inspected.name}
world pos:   [${inspected.worldPosition.map((n) => n.toFixed(2)).join(', ')}]
local pos:   [${inspected.localPosition.map((n) => n.toFixed(2)).join(', ')}]
local rot°:  [${inspected.localRotationDeg.map((n) => n.toFixed(1)).join(', ')}]
local scale: [${inspected.localScale.map((n) => n.toFixed(3)).join(', ')}]`}
        </div>
      )}
    </div>
  );
}

export default HotelModelViewerPage;
