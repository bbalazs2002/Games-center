import type { ArraySchema } from '@colyseus/schema';

/**
 * Replaces a string ArraySchema's contents in place — for small,
 * infrequently-changing arrays where push-only diffing isn't worth the
 * extra complexity. Extracted from hotelStateCodec.ts once ramsesStateCodec.ts
 * needed the exact same helper (see docs/ramses-0b-specifikacio.md §3.3) —
 * the "generalize once a second consumer needs it" convention.
 */
export function replaceStringArray(target: ArraySchema<string>, values: readonly string[]): void {
  target.splice(0, target.length, ...values);
}
