import type { ArraySchema } from '@colyseus/schema';

/**
 * Replaces a string ArraySchema's contents in place — for small,
 * infrequently-changing arrays where push-only diffing isn't worth the
 * extra complexity. Extracted from hotelStateCodec.ts once ramsesStateCodec.ts
 * needed the exact same helper (see docs/ramses-0b-specifikacio.md §3.3) —
 * the "generalize once a second consumer needs it" convention.
 *
 * Deliberately NOT a single `target.splice(0, target.length, ...values)` —
 * @colyseus/schema's own ArraySchema#splice refuses to insert more elements
 * than it deletes in one call ("insertCount must be equal or lower than
 * deleteCount"), which throws whenever `values` is longer than the
 * PREVIOUS contents — exactly what happens the moment `winnerIds` goes
 * from empty (mid-game) to non-empty (game just ended), silently breaking
 * the sync of a game finishing over the network (real bug, caught
 * 2026-07-30 testing Ramses's new FORFEIT action in genuine 2-client
 * multiplayer — the server crashed inside syncState() and the client never
 * saw `status` flip to FINISHED). Clearing then pushing separately never
 * hits that constraint, since a bare push is never treated as a splice.
 */
export function replaceStringArray(target: ArraySchema<string>, values: readonly string[]): void {
  target.splice(0, target.length);
  target.push(...values);
}
