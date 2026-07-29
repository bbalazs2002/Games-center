import { Euler, Quaternion } from 'three';

/**
 * Naming/scale constants for the combined Blender-authored board scene
 * (Hotel-0c.2) — see docs/hotel-0c-specifikacio.md §5.5/5.7. Every helper
 * here maps a piece of GAME STATE to the exact object name the user authored
 * in Blender (Outliner), verified 1:1 against the actual export before this
 * code was written (not guessed).
 */
export const HOTEL_MODEL_URL = '/assets/hotel/full-board.glb';

/**
 * The real model's own baked position/scale is used AS-IS, unmodified —
 * every hotel/board/car/stairs object keeps exactly the coordinates the user
 * authored (Fusion 360, ~10x Blender's unit convention, then combined into
 * one Blender scene at that native scale). Rather than shrinking the model
 * data down to fit the old ~12-unit placeholder convention (a fragile,
 * error-prone guess at a "correct" divisor), the REST of the scene — camera
 * distance/FOV, OrbitControls limits, and every purely-decorative local size
 * (fallback boxes, space markers, garden decals, token spacing) — is scaled
 * UP by this factor instead, so nothing about the real model's own
 * position/rotation ever needs correcting or second-guessing. Measured
 * directly from the exported file: the `board` mesh spans roughly ±252
 * units after its own baked ×10 scale, and the old placeholder convention
 * (`BOARD_SIZE=12`) that today's camera/controls were tuned against wants a
 * board spanning ~12 units — 505 / 12 ≈ 40 (rounded to a clean number).
 */
export const HOTEL_SCENE_SCALE = 40;

/**
 * The whole raw scene loads with its "up" pointing at world -Y instead of
 * +Y — confirmed directly by the user via a dedicated, correction-free `.glb`
 * inspector (`HotelModelViewerPage.tsx`) built specifically to settle this
 * after three earlier rounds of per-object rotation math each looked right
 * in isolated testing and were each wrong once checked against a harder live
 * case (see docs/hotel-0c-specifikacio.md §5.7 for the full history): "az
 * egész hibátlanul jelenik meg, csak fejjel lefelé. Az up irány a -Y."
 * (everything renders flawlessly, just upside down — up is -Y).
 *
 * A single, global 180° rotation around X — NOT a literal mirror/reflection,
 * despite the user's own first word for it ("tükrözd meg"). A true single-axis
 * reflection was tried first and visibly broke every piece of board text
 * (WAIKIKI/ROYAL/FUJIYAMA all rendered backwards) — a reflection always
 * reverses handedness/readability, which is not what "just upside down"
 * actually called for. `Rx(180°)` flips Y the same way a reflection would,
 * but — being a proper rotation — preserves handedness, so text reads
 * correctly. Verified against all three ground truths at once: readable
 * board text, buildings standing upright, and the drawn "Start" arrow lined
 * up with the actual car/token positions.
 *
 * Applied as a wrapping `<group rotation={HOTEL_UP_ROTATION}>` around real
 * model content only (`HotelGamePage.tsx`) — never around fallback
 * placeholders, which are plain, already-correct +Y-up Three.js geometry
 * authored directly in that file — and as a manual Y-negation wherever a raw
 * position is read as a plain number instead of going through the scene
 * graph (`useHotelSpacePositions.ts`).
 */
export const HOTEL_UP_ROTATION: [number, number, number] = [Math.PI, 0, 0];

/**
 * Quaternion form of `HOTEL_UP_ROTATION`, for code that reads a raw
 * position/rotation as plain numbers (not through the scene graph, so it
 * can't rely on a wrapping `<group rotation={HOTEL_UP_ROTATION}>` to apply
 * the correction automatically) — `useHotelSpacePositions.ts`,
 * `useHotelParkingPositions.ts`. Composing a raw baked rotation with this
 * (via `.premultiply`) gives the exact same effective world rotation a
 * wrapping group would produce; rotating a raw position vector by it
 * (`x,y,z → x,-y,-z`, since this is precisely what `Rx(180°)` does to a
 * point) gives the same effective world position.
 */
export const HOTEL_UP_ROTATION_QUATERNION = new Quaternion().setFromEuler(new Euler(...HOTEL_UP_ROTATION));

/**
 * Per-player parking spot, distinct from `car-1`/Start — one dedicated
 * object per color, in the SAME order `HotelGamePage.tsx`'s `PLAYER_COLORS`
 * assigns colors to player slots (index 0 = red, 1 = blue, 2 = green,
 * 3 = yellow), so `HOTEL_PARKING_COLOR_NAMES[i]` always names the right
 * parking spot for `PLAYER_COLORS[i]`.
 */
export const HOTEL_PARKING_COLOR_NAMES = ['red', 'blue', 'green', 'yellow'] as const;

export function hotelParkingCarObjectName(colorName: string): string {
  return `car-0-${colorName}`;
}

/**
 * One object per building TIER (e.g. `Royal-1`..`Royal-4`), except hotels
 * with only a single tier (currently just Boomerang), which the user named
 * WITHOUT a numeric suffix (`Boomerang`, not `Boomerang-1`) — `totalTiers`
 * drives this off the same `lot.buildingPrices.length` the engine already
 * uses, not a hardcoded hotel-id special case.
 */
export function hotelBuildingObjectName(assetName: string, tier: number, totalTiers: number): string {
  return totalTiers === 1 ? assetName : `${assetName}-${tier}`;
}

export function hotelGardenObjectName(assetName: string): string {
  return `${assetName}-garden`;
}

/** `spaceNumber` is 1-based, matching both the engine's `space-N` ids and the asset's own numbering — `lotId` is the engine's lowercase id (`royal`, `fujiyama`, ...), matching the asset directly (unlike buildings, which use the capitalized display name). */
export function hotelStairsObjectName(spaceNumber: number, lotId: string): string {
  return `stairs-${spaceNumber}-${lotId}`;
}

/** `spaceNumber` is 1-based — `car-1` is `space-1` (Start), ..., `car-31` is `space-31`. */
export function hotelCarObjectName(spaceNumber: number): string {
  return `car-${spaceNumber}`;
}

/** File-name prefix for each hotel's already-curated photos — gardens/{name}-garden.png, property-cards/{name}-{const,nights}.jpg. */
export const HOTEL_IMAGE_NAME: Record<string, string> = {
  waikiki: 'Waikiki',
  royal: 'Royal',
  letoile: 'Letoile',
  boomerang: 'Boomerang',
  tajmahal: 'TajMahal',
  safari: 'Safari',
  president: 'President',
  fujiyama: 'Fujiyama',
};

export function propertyCardUrl(lotId: string, kind: 'const' | 'nights'): string {
  return `/assets/hotel/property-cards/${HOTEL_IMAGE_NAME[lotId]}-${kind}.jpg`;
}
