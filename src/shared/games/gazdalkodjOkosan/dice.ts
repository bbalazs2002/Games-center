/**
 * Mirrors the client's own dice generation (GazdalkodjOkosanGamePage.tsx).
 * GazdalkodjOkosanRoom uses this to REGENERATE `ROLL_MOVE_DICE`'s value for
 * online play instead of trusting whatever an untrusted client sends — see
 * the Hotel precedent (src/shared/games/hotel/dice.ts, docs/hotel-0d-ai-specifikacio.md §4.6).
 * A hot-seat player's own rolls still come from the client's own copy,
 * unrelated to this module. Kept as its own file (not inlined in the Room)
 * so a future 0d AI round can reuse it directly, same reasoning as Hotel's.
 */
export function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}
