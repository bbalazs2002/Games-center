import type { BuildingPermitResult } from './engine/state';

/**
 * Mirrors the human client's rollD6/rollPermitDie
 * (src/client/games/hotel/ui/hotelMenuLevels.tsx). Two uses, both needing a
 * REAL random draw rather than the shared/games/hotel/ai search's
 * hypothetical chance-node averaging:
 * - HotelRoom regenerates ROLL_MOVE_DICE/ROLL_NIGHTS/ROLL_BUILDING_PERMIT
 *   values for ONLINE human actions instead of trusting whatever value an
 *   untrusted client sends (see docs/hotel-0d-ai-specifikacio.md §4.6).
 * - Any AI player (online or hot-seat) uses this directly via
 *   shared/games/hotel/ai's realRollAction to actually roll when that's its
 *   only legal move.
 * A human hot-seat player's own dice rolls still come from the client's own
 * copy above, unrelated to this module.
 */
export function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// Same weighting as the client's PERMIT_DIE_FACES — 3x GREEN, 1x each of the rest.
const PERMIT_DIE_FACES: readonly BuildingPermitResult[] = ['GREEN', 'GREEN', 'GREEN', 'FREE', 'DOUBLE', 'RED'];

export function rollBuildingPermit(): BuildingPermitResult {
  return PERMIT_DIE_FACES[Math.floor(Math.random() * PERMIT_DIE_FACES.length)];
}
