import { Vector3 } from 'three';
import { HOTEL_SCENE_SCALE } from './hotelModelAssets';

/** Matches the board.jpg texture's aspect ratio (square) and the scale the placeholder rectangle used before it — scaled up by `HOTEL_SCENE_SCALE` to match the real model's native (unscaled) coordinate space, see hotelModelAssets.ts. */
export const BOARD_SIZE = 12 * HOTEL_SCENE_SCALE;

/**
 * Control points tracing the real board's track centerline (see
 * assets/Hotel/png/board.jpg / public/assets/hotel/board.jpg), read off the
 * photo by eye — two loops (Royal, Fujiyama) joined by a winding path,
 * clockwise starting at Start (between Safari and Fujiyama). Normalized
 * image coordinates (u,v), converted to world (x,z) via BOARD_SIZE.
 *
 * First-pass approximation, not pixel-exact — good enough for the token/
 * space positions to visually track the real board underneath; refine by
 * eye (Playwright screenshot or live browser) rather than re-deriving from
 * the photo again from scratch.
 */
const CONTROL_POINTS_UV: [number, number][] = [
  [0.93, 0.52], // Start
  [0.9, 0.62],
  [0.84, 0.7], // Fujiyama loop, right
  [0.75, 0.75],
  [0.65, 0.77], // Fujiyama loop, bottom
  [0.58, 0.74],
  [0.51, 0.72], // waist crossing near the river
  [0.44, 0.71],
  [0.34, 0.73], // Royal loop, bottom
  [0.22, 0.69],
  [0.11, 0.56], // Royal loop, left
  [0.09, 0.42],
  [0.15, 0.31], // Royal loop, top / Waikiki transition
  [0.08, 0.22],
  [0.2, 0.12],
  [0.38, 0.07], // top bend, Taj Mahal
  [0.58, 0.06],
  [0.75, 0.1], // top bend, toward Safari
  [0.87, 0.2],
  [0.93, 0.35],
];

function uvToWorld([u, v]: [number, number]): Vector3 {
  return new Vector3((u - 0.5) * BOARD_SIZE, 0, (v - 0.5) * BOARD_SIZE);
}

export const HOTEL_BOARD_CONTROL_POINTS: Vector3[] = CONTROL_POINTS_UV.map(uvToWorld);

/**
 * Approximate zone centers (by eye, from the same photo as the control
 * points above) for each hotel — where its built units cluster, since a
 * hotel's buildings belong to its own zone on the real board, not to any one
 * track space. First-pass anchor points only, not per-slot precision (the
 * board photo shows individual building-footprint outlines for at least
 * Waikiki/Taj Mahal/Safari/President) — refine once photos of the board with
 * buildings placed are available, see docs/hotel-0c-specifikacio.md §5.4.
 */
const HOTEL_ZONE_CENTERS_UV: Record<string, [number, number]> = {
  royal: [0.17, 0.47],
  fujiyama: [0.75, 0.65],
  letoile: [0.49, 0.45],
  waikiki: [0.13, 0.1],
  tajmahal: [0.38, 0.12],
  safari: [0.85, 0.08],
  president: [0.17, 0.84],
  boomerang: [0.88, 0.92],
};

export const HOTEL_ZONE_CENTERS: Record<string, Vector3> = Object.fromEntries(
  Object.entries(HOTEL_ZONE_CENTERS_UV).map(([id, uv]) => [id, uvToWorld(uv)]),
);
