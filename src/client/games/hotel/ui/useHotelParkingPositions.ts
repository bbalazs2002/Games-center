import { useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';
import { useGLTFScene } from '../../../renderers/models/useGLTFScene';
import {
  HOTEL_MODEL_URL,
  HOTEL_PARKING_COLOR_NAMES,
  HOTEL_UP_ROTATION_QUATERNION,
  hotelParkingCarObjectName,
} from './hotelModelAssets';

export interface HotelParkingTransform {
  position: Vector3;
  rotation: Quaternion;
}

/**
 * Reads the 4 dedicated, per-player-color parking positions (`car-0-red`,
 * `car-0-blue`, `car-0-green`, `car-0-yellow`) directly from the
 * Blender-authored scene — where an un-moved player's token actually sits
 * before their first roll, distinct from (and no longer approximated as)
 * `car-1`/Start. See docs/hotel-0c-specifikacio.md §5.7/5.8.
 *
 * Returns one entry per `HOTEL_PARKING_COLOR_NAMES` slot, in that same
 * order — `null` for a slot whose object is missing (falls back to no
 * off-track position for that color, matching `LoopTrackBoard3D`'s own
 * built-in fallback). Returns `null` entirely until the model loads.
 */
export function useHotelParkingPositions(): (HotelParkingTransform | null)[] | null {
  const scene = useGLTFScene(HOTEL_MODEL_URL);

  return useMemo(() => {
    if (!scene) return null;
    return HOTEL_PARKING_COLOR_NAMES.map((colorName) => {
      const object = scene.getObjectByName(hotelParkingCarObjectName(colorName));
      if (!object) return null;
      const { x, y, z } = object.position;
      return {
        position: new Vector3(x, -y, -z),
        rotation: object.quaternion.clone().premultiply(HOTEL_UP_ROTATION_QUATERNION),
      };
    });
  }, [scene]);
}
