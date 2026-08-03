import { useEffect, useRef } from 'react';

/**
 * Returns only the items appended to `items` since the last render — for an
 * append-only array (e.g. a game's event log), this is the reliable way to
 * detect "what just happened" without diffing the whole state tree by hand.
 * Game-agnostic: any future game with its own structured log can reuse this
 * unchanged to drive its own animations.
 *
 * The ref update happens in an effect, not during render — a real bug (all
 * log-driven animations silently never firing, reported as "the animations
 * disappeared," 2026-08-03) turned out to be caused by mutating the ref
 * directly in the render body: React 18 StrictMode's dev-mode double-render
 * invokes a component function twice per actual update, so the FIRST
 * (discarded) invocation already advanced `previousLengthRef` to the new
 * length, leaving the SECOND (real) invocation to see `items.length <=
 * previousLength` and return `[]` — every single time, 100% reproducible
 * under `npm run dev`. Effects don't have this problem (their own
 * StrictMode double-invoke is mount-only and side-effect-free here, since
 * this effect has no cleanup and just re-asserts the same value).
 */
export function useNewItemsSince<T>(items: T[]): T[] {
  const previousLengthRef = useRef(items.length);
  const previousLength = previousLengthRef.current;

  useEffect(() => {
    previousLengthRef.current = items.length;
  });

  // The array shrank (e.g. a fresh game started) — nothing "new" to react to.
  if (items.length <= previousLength) return [];
  return items.slice(previousLength);
}
