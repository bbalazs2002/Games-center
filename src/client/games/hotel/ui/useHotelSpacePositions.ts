import { useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';
import { useGLTFScene } from '../../../renderers/models/useGLTFScene';
import { HOTEL_MODEL_URL, HOTEL_UP_ROTATION_QUATERNION, hotelCarObjectName } from './hotelModelAssets';

export interface HotelSpaceTransforms {
  positions: Vector3[];
  /** Parallel to `positions` — the direction that space's own `car-N` object faces, so a token visiting it can orient the same way (see docs/hotel-0c-specifikacio.md §5.8, "per-space orientation"). */
  rotations: Quaternion[];
}

/**
 * Reads the 31 on-loop space positions/rotations directly from the
 * Blender-authored combined scene's `car-1`..`car-N` objects — each already
 * sits exactly where (and facing exactly how) that space belongs on the real
 * board, since the user positioned the whole scene together against one
 * reference plane. Replaces the eyeballed `computeSplineLoopPositions`
 * estimate once the real model is available — see
 * docs/hotel-0c-specifikacio.md §5.5/5.7/5.8.
 *
 * Returns null (caller falls back to the spline estimate) until the model
 * loads, or if any single space's `car-N` object is missing — deliberately
 * all-or-nothing, since a board that's part real/part guessed positions
 * would look worse (visibly inconsistent spacing) than a fully consistent
 * guess.
 */
export function useHotelSpacePositions(spaceCount: number): HotelSpaceTransforms | null {
  const scene = useGLTFScene(HOTEL_MODEL_URL);

  return useMemo(() => {
    if (!scene) return null;
    const positions: Vector3[] = [];
    const rotations: Quaternion[] = [];
    for (let spaceNumber = 1; spaceNumber <= spaceCount; spaceNumber += 1) {
      const object = scene.getObjectByName(hotelCarObjectName(spaceNumber));
      if (!object) return null;
      // Matches HOTEL_UP_ROTATION (Rx(180°), see hotelModelAssets.ts): X
      // unchanged, Y and Z both negated for the position; the rotation gets
      // the same correction pre-multiplied in — see
      // HOTEL_UP_ROTATION_QUATERNION's doc comment for why this is exactly
      // equivalent to a wrapping `<group rotation={HOTEL_UP_ROTATION}>`.
      const { x, y, z } = object.position;
      positions.push(new Vector3(x, -y, -z));
      rotations.push(object.quaternion.clone().premultiply(HOTEL_UP_ROTATION_QUATERNION));
    }
    return { positions, rotations };
  }, [scene, spaceCount]);
}
