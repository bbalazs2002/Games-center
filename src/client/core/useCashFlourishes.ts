import { useEffect, useRef, useState } from 'react';
import { useNewItemsSince } from './useNewItemsSince';

export const FLOURISH_LIFETIME_MS = 1200;

export interface CashFlourish {
  id: number;
  amount: number;
  /** Short (2-3 word) label of WHAT the movement was — the amount alone doesn't say whether it was rent, a purchase, a bonus, etc. (a real Hotel playtest request, 2026-07-30). Deliberately shorter than the full-sentence descriptions the game-log panel already shows. */
  label: string;
}

export interface CashDelta {
  amount: number;
  label: string;
}

/**
 * Floating +/- numbers next to a player's cash figure — purely decorative,
 * auto-expiring after `FLOURISH_LIFETIME_MS`. Game-agnostic: originally
 * Hotel-only (`useTransientLogEffects.ts`), pulled out here once Gazdálkodj
 * okosan needed the identical mechanism — each game supplies its own
 * `computeDelta`, switching on its own `LogEntry['type']` union, while the
 * hook itself (new-entry detection, timers, expiry) is shared verbatim.
 */
export function useCashFlourishes<TLogEntry>(
  log: TLogEntry[],
  playerId: string,
  computeDelta: (entry: TLogEntry, playerId: string) => CashDelta | null,
): CashFlourish[] {
  const newEntries = useNewItemsSince(log);
  const [flourishes, setFlourishes] = useState<CashFlourish[]>([]);
  const nextIdRef = useRef(0);

  useEffect(() => {
    const deltas = newEntries.map((entry) => computeDelta(entry, playerId)).filter((delta) => delta !== null);
    if (deltas.length === 0) return;

    const added = deltas.map((delta) => ({ id: nextIdRef.current++, amount: delta.amount, label: delta.label }));
    setFlourishes((prev) => [...prev, ...added]);
    const timeoutId = setTimeout(() => {
      setFlourishes((prev) => prev.filter((flourish) => !added.includes(flourish)));
    }, FLOURISH_LIFETIME_MS);
    return () => clearTimeout(timeoutId);
    // newEntries is a fresh array every render by design (useNewItemsSince) — only its CONTENT (via log) should retrigger this. computeDelta is expected to be a stable (or at least referentially-cheap) function, same assumption Hotel's original made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, playerId]);

  return flourishes;
}
