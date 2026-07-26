import { useRef } from 'react';

/**
 * Returns only the items appended to `items` since the last render — for an
 * append-only array (e.g. a game's event log), this is the reliable way to
 * detect "what just happened" without diffing the whole state tree by hand.
 * Game-agnostic: any future game with its own structured log can reuse this
 * unchanged to drive its own animations.
 */
export function useNewItemsSince<T>(items: T[]): T[] {
  const previousLengthRef = useRef(items.length);
  const previousLength = previousLengthRef.current;
  previousLengthRef.current = items.length;

  // The array shrank (e.g. a fresh game started) — nothing "new" to react to.
  if (items.length <= previousLength) return [];
  return items.slice(previousLength);
}
