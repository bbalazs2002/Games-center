import type { FurnitureItemId } from './state';

/**
 * A dobott érték az action RÉSZE (a hívó — pl. a UI — generálja), nem a
 * reducer belsejében sorsolódik ki — így a reducer tiszta és determinisztikus
 * marad, ugyanaz az elv, mint a Hotel motorjában.
 */
export type GazdalkodjOkosanAction =
  | { type: 'ROLL_MOVE_DICE'; value: number }
  // Kötelező, ha 'apartment'/'car' szerepel a pendingMandatoryInstallments-ban
  // (legalább a perTurnPayment összeggel) — az `amount` opcionális, nagyobb
  // törlesztésre (a szabálykönyv szerint engedélyezett).
  | { type: 'PAY_APARTMENT_INSTALLMENT'; amount?: number }
  | { type: 'PAY_CAR_INSTALLMENT'; amount?: number }
  | { type: 'BUY_APARTMENT'; financed: boolean }
  | { type: 'BUY_CAR'; financed: boolean }
  | { type: 'BUY_FURNITURE'; item: FurnitureItemId }
  // KIZÁRÓLAG a 8-as mezőn (player.position === 8); azonnal bankkártyát is ad; legfeljebb 1x/játékos.
  | { type: 'OPEN_BANK_ACCOUNT' }
  // cash -> bankAccount, KIZÁRÓLAG a 8-as mezőn.
  | { type: 'DEPOSIT_TO_ACCOUNT'; amount: number }
  // bankAccount -> cash, bárhol/bármikor.
  | { type: 'WITHDRAW_FROM_ACCOUNT'; amount: number }
  | { type: 'BUY_INSURANCE'; policy: 'life' | 'home' | 'car' }
  // Csak a 2-es mezőn.
  | { type: 'BUY_BKV_PASS' }
  // Szerencsekártya-mezőn (a mező típusától/requiresBkvPass-től függően engedélyezett).
  | { type: 'DRAW_CHANCE_CARD' }
  // Kizárólag AWAITING_CHANCE_CARD_ACK fázisban — a húzott kártya hatásának megerősítése, mielőtt bármi más action engedélyezett.
  | { type: 'ACK_CHANCE_CARD' }
  | { type: 'END_TURN' };
