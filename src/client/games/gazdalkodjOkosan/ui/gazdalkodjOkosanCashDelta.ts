import type { CashDelta } from '../../../core/useCashFlourishes';
import { APARTMENT_PURCHASE_TERMS, BKV_PASS_PRICE, CAR_PURCHASE_TERMS, INSURANCE_PRICES } from '@shared/games/gazdalkodjOkosan/engine/boardConfig';
import { FURNITURE_CATALOG } from '@shared/games/gazdalkodjOkosan/engine/furnitureCatalog';
import type { LogEntry, PlayerId } from '@shared/games/gazdalkodjOkosan/engine/state';

/**
 * Purchase-type log entries don't carry the price they cost — only whether
 * it was financed — so the actual amount is looked up from the same static
 * price tables the reducer itself used (`downPayment` when financed,
 * `cashPrice` when not; see boardConfig.ts's `PurchaseTerms`).
 */
function purchaseAmount(financed: boolean, terms: { cashPrice: number; downPayment: number }): number {
  return financed ? terms.downPayment : terms.cashPrice;
}

/** Every `LogEntry` variant carries a `playerId` — entries about a different player never affect this player's cash. */
// eslint-disable-next-line complexity -- egyetlen lapos leképezés, minden ág egysoros, bontása csak áttekinthetetlenebbé tenné
function cashDeltaForActor(entry: LogEntry, playerId: PlayerId): CashDelta | null {
  if (entry.playerId !== playerId) return null;
  switch (entry.type) {
    case 'MOVED':
      return entry.startBonus > 0 ? { amount: entry.startBonus, label: 'Start bónusz' } : null;
    case 'SPACE_PAYMENT':
      return entry.amount > 0 ? { amount: -entry.amount, label: 'Mezőfizetés' } : null;
    case 'MONEY_TRANSFERRED':
      return entry.direction === 'DEPOSIT' ? { amount: -entry.amount, label: 'Befizetés' } : { amount: entry.amount, label: 'Kivétel' };
    case 'INTEREST_PAID':
      return { amount: entry.amount, label: 'Kamat' };
    case 'INSTALLMENT_PAID':
      return { amount: -entry.amount, label: 'Törlesztés' };
    case 'APARTMENT_PURCHASED':
      return { amount: -purchaseAmount(entry.financed, APARTMENT_PURCHASE_TERMS), label: 'Lakás vásárlás' };
    case 'CAR_PURCHASED':
      return { amount: -purchaseAmount(entry.financed, CAR_PURCHASE_TERMS), label: 'Autó vásárlás' };
    case 'FURNITURE_PURCHASED':
      return { amount: -FURNITURE_CATALOG[entry.item].price, label: 'Bútor vásárlás' };
    case 'INSURANCE_BOUGHT':
      return { amount: -INSURANCE_PRICES[entry.policy], label: 'Biztosítás' };
    case 'BKV_PASS_PURCHASED':
      return { amount: -BKV_PASS_PRICE, label: 'BKV-bérlet' };
    case 'FIRE_EVENT':
      return entry.insured && entry.payout > 0 ? { amount: entry.payout, label: 'Tűzeset kártérítés' } : null;
    case 'CAR_THEFT':
      return entry.insured && entry.payout > 0 ? { amount: entry.payout, label: 'Autólopás kártérítés' } : null;
    default:
      return null;
  }
}

/** The signed cash change (+ a short label of what caused it) a log entry causes for `playerId`, or null if the entry doesn't affect them (or causes no actual change). Passed into the shared `useCashFlourishes` hook. */
export function gazdalkodjCashDeltaForPlayer(entry: LogEntry, playerId: PlayerId): CashDelta | null {
  return cashDeltaForActor(entry, playerId);
}
