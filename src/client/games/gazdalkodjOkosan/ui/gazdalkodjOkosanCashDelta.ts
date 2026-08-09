import type { CashDelta } from '../../../core/useCashFlourishes';
import type { LogEntry, PlayerId } from '@shared/games/gazdalkodjOkosan/engine/state';

/** Every `LogEntry` variant carries a `playerId` — entries about a different player never affect this player's cash. */
// eslint-disable-next-line complexity -- egyetlen lapos leképezés, minden ág egysoros, bontása csak áttekinthetetlenebbé tenné
function cashDeltaForActor(entry: LogEntry, playerId: PlayerId): CashDelta | null {
  if (entry.playerId !== playerId) return null;
  switch (entry.type) {
    case 'MOVED':
      return entry.startBonus > 0 ? { amount: entry.startBonus, label: 'Start bónusz' } : null;
    case 'SPACE_PAYMENT':
      return entry.cashAmount > 0 ? { amount: -entry.cashAmount, label: 'Mezőfizetés' } : null;
    case 'MONEY_TRANSFERRED':
      return entry.direction === 'DEPOSIT' ? { amount: -entry.amount, label: 'Befizetés' } : { amount: entry.amount, label: 'Kivétel' };
    case 'INTEREST_PAID':
      return { amount: entry.amount, label: 'Kamat' };
    case 'INSTALLMENT_PAID':
      return entry.cashAmount > 0 ? { amount: -entry.cashAmount, label: 'Törlesztés' } : null;
    case 'APARTMENT_PURCHASED':
      return entry.cashAmount > 0 ? { amount: -entry.cashAmount, label: 'Lakás vásárlás' } : null;
    case 'CAR_PURCHASED':
      return entry.cashAmount > 0 ? { amount: -entry.cashAmount, label: 'Autó vásárlás' } : null;
    case 'FURNITURE_PURCHASED':
      return entry.cashAmount > 0 ? { amount: -entry.cashAmount, label: 'Bútor vásárlás' } : null;
    case 'INSURANCE_BOUGHT':
      return entry.cashAmount > 0 ? { amount: -entry.cashAmount, label: 'Biztosítás' } : null;
    case 'BKV_PASS_PURCHASED':
      return entry.cashAmount > 0 ? { amount: -entry.cashAmount, label: 'BKV-bérlet' } : null;
    case 'FIRE_EVENT':
      return entry.insured && entry.payout > 0 ? { amount: entry.payout, label: 'Tűzeset kártérítés' } : null;
    case 'CAR_THEFT':
      return entry.insured && entry.payout > 0 ? { amount: entry.payout, label: 'Autólopás kártérítés' } : null;
    default:
      return null;
  }
}

/** The signed cash change (+ a short label of what caused it) a log entry causes for `playerId`, or null if the entry doesn't affect them (or causes no actual change). Passed into the shared `useCashFlourishes` hook. Only the CASH portion of a split (cash+bank) payment triggers a flourish here — the bank portion doesn't change `cash`. */
export function gazdalkodjCashDeltaForPlayer(entry: LogEntry, playerId: PlayerId): CashDelta | null {
  return cashDeltaForActor(entry, playerId);
}
