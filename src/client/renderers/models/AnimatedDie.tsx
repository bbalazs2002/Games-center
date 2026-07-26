import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

export interface AnimatedDieProps {
  /** Texture URLs for the 6 box faces, in BoxGeometry's own material-group order: [+X, -X, +Y, -Y, +Z, -Z]. */
  faceTextures: [string, string, string, string, string, string];
  /** Index (0-5) into faceTextures of the face that should end up facing up once the roll settles. */
  resultFaceIndex: number;
  /** Bump this (e.g. the game log's length) to trigger a fresh roll animation, even if resultFaceIndex is unchanged from last time. */
  rollKey: number | string;
  position?: [number, number, number];
  size?: number;
}

const FACE_NORMALS: THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** How long the die tumbles freely before easing into its final, correct-face-up orientation. */
const TUMBLE_SECONDS = 0.5;
const SETTLE_SECONDS = 0.35;

function targetQuaternionFor(resultFaceIndex: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[resultFaceIndex], WORLD_UP);
}

/**
 * A real, photo-textured 3D die that tumbles and settles on the correct face
 * — see docs/hotel-0c-specifikacio.md §5.3. Game-agnostic (any board game
 * with a physical die can reuse this, not just Hotel's move/permit dice).
 */
export function AnimatedDie({ faceTextures, resultFaceIndex, rollKey, position = [0, 0, 0], size = 1 }: AnimatedDieProps) {
  const textures = useTexture(faceTextures);
  const meshRef = useRef<THREE.Mesh>(null);
  const phaseRef = useRef<'tumbling' | 'settling' | 'idle'>('idle');
  const elapsedRef = useRef(0);
  const spinAxisRef = useRef(new THREE.Vector3(1, 0, 0));
  const settleStartRef = useRef(new THREE.Quaternion());
  const targetRef = useRef(targetQuaternionFor(resultFaceIndex));

  useEffect(() => {
    targetRef.current = targetQuaternionFor(resultFaceIndex);
    elapsedRef.current = 0;
    phaseRef.current = 'tumbling';
    spinAxisRef.current.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  }, [resultFaceIndex, rollKey]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || phaseRef.current === 'idle') return;
    elapsedRef.current += delta;
    const t = elapsedRef.current;

    if (t < TUMBLE_SECONDS) {
      mesh.rotateOnAxis(spinAxisRef.current, delta * 13);
      return;
    }
    if (phaseRef.current === 'tumbling') {
      phaseRef.current = 'settling';
      settleStartRef.current.copy(mesh.quaternion);
    }
    const settleT = Math.min((t - TUMBLE_SECONDS) / SETTLE_SECONDS, 1);
    const eased = 1 - (1 - settleT) ** 3;
    mesh.quaternion.slerpQuaternions(settleStartRef.current, targetRef.current, eased);
    if (settleT >= 1) phaseRef.current = 'idle';
  });

  return (
    <mesh ref={meshRef} position={position} quaternion={targetRef.current}>
      <boxGeometry args={[size, size, size]} />
      {textures.map((texture, index) => (
        <meshStandardMaterial key={index} attach={`material-${index}`} map={texture} />
      ))}
    </mesh>
  );
}
