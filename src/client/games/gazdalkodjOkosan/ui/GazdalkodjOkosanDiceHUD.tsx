import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { AnimatedDie } from '../../../renderers/models/AnimatedDie';
import { assetUrl } from '../../../core/assetUrl';
import type { GazdalkodjOkosanState } from '@shared/games/gazdalkodjOkosan/engine/state';
import styles from './GazdalkodjOkosanDiceHUD.module.css';

/** [+X,-X,+Y,-Y,+Z,-Z] face order — see AnimatedDie. Any consistent assignment works; only the value->index lookup below has to agree with it. Generated placeholder faces (no real dice photo exists for this game yet) — see scripts/generate-gazdalkodj-okosan-dice.mjs. */
const DIE_FACE_TEXTURES: [string, string, string, string, string, string] = [1, 2, 3, 4, 5, 6].map((n) =>
  assetUrl(`/assets/gazdalkodj-okosan/dice/dice-${n}.jpg`),
) as [string, string, string, string, string, string];

export interface GazdalkodjOkosanDiceHUDProps {
  state: GazdalkodjOkosanState;
}

/**
 * A single, real animated die tumbling into place on every roll — mirrors
 * Hotel's `DiceHUD.tsx`/`DieTray` structural pattern (its own small,
 * fixed-camera `Canvas`, independent of the main board's OrbitControls),
 * reusing the shared, game-agnostic `AnimatedDie` directly. Simpler than
 * Hotel's version: only one die type here (no separate nights/permit dice).
 */
export function GazdalkodjOkosanDiceHUD({ state }: GazdalkodjOkosanDiceHUDProps) {
  if (state.lastDiceRoll === null) return null;

  // Counts actual DICE_ROLLED entries, not MOVED ones — a hospital-stuck
  // roll (or a skipNextRoll-consuming roll) still rolls the die without
  // necessarily moving the token, and should still re-trigger the tumble.
  const rollCount = state.log.filter((entry) => entry.type === 'DICE_ROLLED').length;

  return (
    <div className={styles.tray}>
      <Canvas
        style={{ width: '4.5rem', height: '4.5rem' }}
        camera={{ position: [2, 2.3, 2.3], fov: 40 }}
        gl={{ alpha: true }}
      >
        <ambientLight intensity={0.95} />
        <directionalLight position={[3, 5, 3]} intensity={1} />
        <Suspense fallback={null}>
          <AnimatedDie faceTextures={DIE_FACE_TEXTURES} resultFaceIndex={state.lastDiceRoll - 1} rollKey={rollCount} size={1.4} />
        </Suspense>
      </Canvas>
      <span className={styles.caption}>Dobás: {state.lastDiceRoll}</span>
    </div>
  );
}
