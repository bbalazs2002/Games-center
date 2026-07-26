import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { AnimatedDie } from '../../../renderers/models/AnimatedDie';
import type { BuildingPermitResult, HotelState } from '../../../../shared/games/hotel/engine/state';
import styles from './DiceHUD.module.css';

const PERMIT_ROLL_LABELS: Record<BuildingPermitResult, string> = {
  GREEN: 'zöld — építhetsz',
  FREE: 'H — ingyen építhetsz',
  DOUBLE: '2 — dupla áron kell építened',
  RED: 'piros — nem építhetsz ebben a körben',
};

/** [+X,-X,+Y,-Y,+Z,-Z] face order — see AnimatedDie. Any consistent assignment works; only the value->index lookup below has to agree with it. */
const MOVE_DIE_FACE_TEXTURES: [string, string, string, string, string, string] = [1, 2, 3, 4, 5, 6].map(
  (n) => `/assets/hotel/dice/dice-${n}.jpg`,
) as [string, string, string, string, string, string];

const PERMIT_DIE_FACE_TEXTURES: [string, string, string, string, string, string] = [
  '/assets/hotel/perm-dice/perm-dice-green.jpg',
  '/assets/hotel/perm-dice/perm-dice-green.jpg',
  '/assets/hotel/perm-dice/perm-dice-green.jpg',
  '/assets/hotel/perm-dice/perm-dice-H.jpg',
  '/assets/hotel/perm-dice/perm-dice-2.jpg',
  '/assets/hotel/perm-dice/perm-dice-red.jpg',
];
const PERMIT_RESULT_FACE_INDEX: Record<BuildingPermitResult, number> = { GREEN: 0, FREE: 3, DOUBLE: 4, RED: 5 };

interface DieTrayProps {
  faceTextures: [string, string, string, string, string, string];
  resultFaceIndex: number;
  rollKey: number;
  caption: string;
}

/** A single die in its own small, fixed-camera canvas — independent of the main board's OrbitControls, so it's always clearly visible regardless of how the board is currently rotated. */
function DieTray({ faceTextures, resultFaceIndex, rollKey, caption }: DieTrayProps) {
  return (
    <div className={styles.tray}>
      <Canvas
        style={{ width: '4.5rem', height: '4.5rem' }}
        // fov/position/die-size chosen with margin so the die's corners
        // never clip the frame at ANY tumble orientation — its worst-case
        // extent is the cube's space-diagonal (half-size * sqrt(3)), bigger
        // than a face-on view would suggest.
        camera={{ position: [2, 2.3, 2.3], fov: 40 }}
        gl={{ alpha: true }}
      >
        <ambientLight intensity={0.95} />
        <directionalLight position={[3, 5, 3]} intensity={1} />
        <Suspense fallback={null}>
          <AnimatedDie faceTextures={faceTextures} resultFaceIndex={resultFaceIndex} rollKey={rollKey} size={1.4} />
        </Suspense>
      </Canvas>
      <span className={styles.caption}>{caption}</span>
    </div>
  );
}

export interface DiceHUDProps {
  state: HotelState;
}

/**
 * Real, photo-textured dice as a compact HUD tray attached to the action
 * wheel — see docs/hotel-0c-specifikacio.md §5.3. Each die tumbles into
 * place on every actual roll of THAT die; counts of each roll TYPE (not
 * state.log.length) drive the trigger, so an unrelated action never makes an
 * already-settled die wiggle again.
 */
export function DiceHUD({ state }: DiceHUDProps) {
  if (state.lastMoveRoll === null && state.lastNightsRoll === null && state.lastBuildingPermitRoll === null) {
    return null;
  }

  const moveRollCount = state.log.filter((entry) => entry.type === 'MOVED').length;
  const nightsRollCount = state.log.filter((entry) => entry.type === 'NIGHTS_STAY').length;
  const permitRollCount = state.log.filter((entry) => entry.type === 'CONSTRUCTION_PERMIT_ROLLED').length;

  return (
    <div className={styles.hud}>
      {state.lastMoveRoll !== null && (
        <DieTray
          faceTextures={MOVE_DIE_FACE_TEXTURES}
          resultFaceIndex={state.lastMoveRoll - 1}
          rollKey={moveRollCount}
          caption={`Kockadobás: ${state.lastMoveRoll}`}
        />
      )}
      {state.lastNightsRoll !== null && (
        <DieTray
          faceTextures={MOVE_DIE_FACE_TEXTURES}
          resultFaceIndex={state.lastNightsRoll - 1}
          rollKey={nightsRollCount}
          caption={`Éjszakák: ${state.lastNightsRoll}`}
        />
      )}
      {state.lastBuildingPermitRoll !== null && (
        <DieTray
          faceTextures={PERMIT_DIE_FACE_TEXTURES}
          resultFaceIndex={PERMIT_RESULT_FACE_INDEX[state.lastBuildingPermitRoll]}
          rollKey={permitRollCount}
          caption={PERMIT_ROLL_LABELS[state.lastBuildingPermitRoll]}
        />
      )}
    </div>
  );
}
