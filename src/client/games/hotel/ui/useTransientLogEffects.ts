import { useEffect, useRef, useState } from 'react';
import { useNewItemsSince } from '../../../core/useNewItemsSince';
import type { LogEntry, PlayerId } from '../../../../shared/games/hotel/engine/state';

const FLOURISH_LIFETIME_MS = 1200;

export interface CashFlourish {
  id: number;
  amount: number;
}

/**
 * Only the paying guest has a permanently visible cash figure to animate
 * next to (StatusChip only ever shows the current player) — the receiving
 * owner isn't shown anywhere, so no flourish for them yet. See
 * docs/hotel-animacio-specifikacio.md §4.2.
 */
function cashDeltaForNightsStay(entry: Extract<LogEntry, { type: 'NIGHTS_STAY' }>, playerId: PlayerId): number | null {
  return entry.playerId === playerId && entry.toPlayerId ? -entry.rentAmount : null;
}

/** Entries where `playerId` (the actor) either always pays, or pays conditionally on the entry's own data. */
function cashDeltaForActingPlayer(entry: LogEntry, playerId: PlayerId): number | null {
  switch (entry.type) {
    case 'LOT_BOUGHT':
    case 'STAIRCASE_RIGHT_BOUGHT':
      return entry.playerId === playerId ? -entry.price : null;
    case 'CONSTRUCTION_PERMIT_ROLLED':
      return entry.playerId === playerId && entry.totalCost > 0 ? -entry.totalCost : null;
    case 'GARDEN_BUILT_WITHOUT_PERMIT':
      return entry.playerId === playerId ? -entry.totalCost : null;
    case 'NIGHTS_STAY':
      return cashDeltaForNightsStay(entry, playerId);
    default:
      return null;
  }
}

/** Entries where `playerId` is a BENEFICIARY, not necessarily the entry's own "playerId" field (BONUS_2000/FREE_* still use playerId; AUCTION_RESOLVED uses winnerId instead). */
function cashDeltaForBeneficiary(entry: LogEntry, playerId: PlayerId): number | null {
  switch (entry.type) {
    case 'BONUS_2000':
      return entry.playerId === playerId ? 2000 : null;
    case 'FREE_STAIRCASE_GRANTED':
    case 'FREE_BUILDING_GRANTED':
      return entry.playerId === playerId && entry.payoutReceived > 0 ? entry.payoutReceived : null;
    case 'AUCTION_RESOLVED':
      return entry.winnerId === playerId ? -entry.amount : null;
    default:
      return null;
  }
}

/** The signed cash change a log entry causes for `playerId`, or null if the entry doesn't affect them (or causes no actual change — e.g. a RED permit roll). */
function cashDeltaForPlayer(entry: LogEntry, playerId: PlayerId): number | null {
  return cashDeltaForActingPlayer(entry, playerId) ?? cashDeltaForBeneficiary(entry, playerId);
}

/** Floating +/- numbers next to a player's cash figure — purely decorative, auto-expiring after FLOURISH_LIFETIME_MS. See docs/hotel-animacio-specifikacio.md §4.2. */
export function useCashFlourishes(log: LogEntry[], playerId: PlayerId): CashFlourish[] {
  const newEntries = useNewItemsSince(log);
  const [flourishes, setFlourishes] = useState<CashFlourish[]>([]);
  const nextIdRef = useRef(0);

  useEffect(() => {
    const deltas = newEntries.map((entry) => cashDeltaForPlayer(entry, playerId)).filter((amount) => amount !== null);
    if (deltas.length === 0) return;

    const added = deltas.map((amount) => ({ id: nextIdRef.current++, amount }));
    setFlourishes((prev) => [...prev, ...added]);
    const timeoutId = setTimeout(() => {
      setFlourishes((prev) => prev.filter((flourish) => !added.includes(flourish)));
    }, FLOURISH_LIFETIME_MS);
    return () => clearTimeout(timeoutId);
    // newEntries is a fresh array every render by design (useNewItemsSince) — only its CONTENT (via log) should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, playerId]);

  return flourishes;
}

export interface RecentLotPurchase {
  lotId: string;
  playerId: PlayerId;
}

/** Lots bought within the last FLOURISH_LIFETIME_MS — drives a brief ownership-color pulse on the board. See docs/hotel-animacio-specifikacio.md §4.4. */
export function useRecentLotPurchases(log: LogEntry[]): RecentLotPurchase[] {
  const newEntries = useNewItemsSince(log);
  const [purchases, setPurchases] = useState<RecentLotPurchase[]>([]);

  useEffect(() => {
    const added = newEntries
      .filter((entry): entry is Extract<LogEntry, { type: 'LOT_BOUGHT' }> => entry.type === 'LOT_BOUGHT')
      .map((entry) => ({ lotId: entry.lotId, playerId: entry.playerId }));
    if (added.length === 0) return;

    setPurchases((prev) => [...prev, ...added]);
    const timeoutId = setTimeout(() => {
      setPurchases((prev) => prev.filter((purchase) => !added.includes(purchase)));
    }, FLOURISH_LIFETIME_MS);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log]);

  return purchases;
}
