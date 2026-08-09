import { useEffect, useState } from 'react';
import { useNewItemsSince } from '../../../core/useNewItemsSince';
import { useCashFlourishes as useSharedCashFlourishes, type CashDelta, type CashFlourish, FLOURISH_LIFETIME_MS } from '../../../core/useCashFlourishes';
import type { LogEntry, PlayerId } from '@shared/games/hotel/engine/state';

export { FLOURISH_LIFETIME_MS };
export type { CashFlourish };

/**
 * Only the paying guest has a permanently visible cash figure to animate
 * next to (StatusChip only ever shows the current player) — the receiving
 * owner isn't shown anywhere, so no flourish for them yet. See
 * docs/hotel-animacio-specifikacio.md §4.2.
 */
function cashDeltaForNightsStay(entry: Extract<LogEntry, { type: 'NIGHTS_STAY' }>, playerId: PlayerId): CashDelta | null {
  if (entry.playerId !== playerId || !entry.toPlayerId) return null;
  return { amount: -entry.rentAmount, label: 'Bérleti díj' };
}

/** LOT_BOUGHT and STAIRCASE_RIGHT_BOUGHT share the exact same {playerId, price} shape — merged into one case below, keyed off this label lookup, purely to keep the switch's branch count (and therefore its eslint `complexity` score) the same as before this label feature was added. */
const PRICE_PAID_LABELS: Partial<Record<LogEntry['type'], string>> = {
  LOT_BOUGHT: 'Telek vásárlás',
  STAIRCASE_RIGHT_BOUGHT: 'Lépcső vásárlás',
};

/** Entries where `playerId` (the actor) either always pays, or pays conditionally on the entry's own data. */
function cashDeltaForActingPlayer(entry: LogEntry, playerId: PlayerId): CashDelta | null {
  switch (entry.type) {
    case 'LOT_BOUGHT':
    case 'STAIRCASE_RIGHT_BOUGHT':
      return entry.playerId === playerId ? { amount: -entry.price, label: PRICE_PAID_LABELS[entry.type]! } : null;
    case 'CONSTRUCTION_PERMIT_ROLLED':
      return entry.playerId === playerId && entry.totalCost > 0
        ? { amount: -entry.totalCost, label: 'Építkezés' }
        : null;
    case 'GARDEN_BUILT_WITHOUT_PERMIT':
      return entry.playerId === playerId ? { amount: -entry.totalCost, label: 'Kert építése' } : null;
    case 'NIGHTS_STAY':
      return cashDeltaForNightsStay(entry, playerId);
    default:
      return null;
  }
}

/** FREE_STAIRCASE_GRANTED and FREE_BUILDING_GRANTED share the exact same {playerId, payoutReceived} shape — same merging reasoning as PRICE_PAID_LABELS above. */
const FREE_PAYOUT_LABELS: Partial<Record<LogEntry['type'], string>> = {
  FREE_STAIRCASE_GRANTED: 'Lépcső helyett készpénz',
  FREE_BUILDING_GRANTED: 'Épület helyett készpénz',
};

/** Entries where `playerId` is a BENEFICIARY, not necessarily the entry's own "playerId" field (BONUS_2000/FREE_* still use playerId; AUCTION_RESOLVED uses winnerId instead). */
function cashDeltaForBeneficiary(entry: LogEntry, playerId: PlayerId): CashDelta | null {
  switch (entry.type) {
    case 'BONUS_2000':
      return entry.playerId === playerId ? { amount: 2000, label: 'Sávbónusz' } : null;
    case 'FREE_STAIRCASE_GRANTED':
    case 'FREE_BUILDING_GRANTED':
      return entry.playerId === playerId && entry.payoutReceived > 0
        ? { amount: entry.payoutReceived, label: FREE_PAYOUT_LABELS[entry.type]! }
        : null;
    case 'AUCTION_RESOLVED':
      return entry.winnerId === playerId ? { amount: -entry.amount, label: 'Árverés' } : null;
    default:
      return null;
  }
}

/** The signed cash change (+ a short label of what caused it) a log entry causes for `playerId`, or null if the entry doesn't affect them (or causes no actual change — e.g. a RED permit roll). */
export function cashDeltaForPlayer(entry: LogEntry, playerId: PlayerId): CashDelta | null {
  return cashDeltaForActingPlayer(entry, playerId) ?? cashDeltaForBeneficiary(entry, playerId);
}

/**
 * Floating +/- numbers next to a player's cash figure — purely decorative,
 * auto-expiring after FLOURISH_LIFETIME_MS. See
 * docs/hotel-animacio-specifikacio.md §4.2. Thin wrapper around the shared,
 * game-agnostic `useCashFlourishes` (`src/client/core/useCashFlourishes.ts`)
 * — only `cashDeltaForPlayer` (Hotel's own log-parsing) lives here now.
 */
export function useCashFlourishes(log: LogEntry[], playerId: PlayerId): CashFlourish[] {
  return useSharedCashFlourishes(log, playerId, cashDeltaForPlayer);
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
