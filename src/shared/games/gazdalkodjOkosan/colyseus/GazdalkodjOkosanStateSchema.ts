import { ArraySchema, defineTypes, Schema } from '@colyseus/schema';
import { PendingJoinRequest } from '../../../core/PendingJoinRequestSchema';

/**
 * Wire-protocol shape for the per-field @colyseus/schema state sync — see
 * docs/gazdalkodj-okosan-0b-multiplayer-specifikacio.md §3-4. Deliberately
 * mirrors ONLY the mutable parts of GazdalkodjOkosanState:
 * - `board` is entirely absent — every BoardSpace field is static forever
 *   (ownership lives on Player, not on the space, unlike Hotel's
 *   HotelLot.ownerId), so both sides just read the shared boardConfig.ts.
 * - `OwnershipStatus`/`furniture`/`insurance` are flattened onto
 *   GazdalkodjOkosanPlayerSchema (no native discriminated-union support in
 *   @colyseus/schema — the Hotel/Ramses precedent).
 * - `chanceDeck`'s card content (text/effect) is static (chanceCards.ts) —
 *   only its ORDER (post-draw rotation) is synced, as an id array.
 *
 * No initializers on any field (`declare` only) — a TS class-field
 * initializer shadows the tracked accessor `defineTypes` sets up, silently
 * breaking sync (see OpaqueGameStateSchema's own comment on this).
 */

export class GazdalkodjOkosanPlayerSchema extends Schema {
  declare id: string;
  declare name: string;
  declare cash: number;
  /** undefined = no account open — see rules.ts canOpenBankAccount. */
  declare bankAccountBalance?: number;
  declare hasBkvPass: boolean;
  declare position: number;
  /** 'NONE' | 'OWNED_CASH' | 'FINANCED' */
  declare apartmentStatus: string;
  declare apartmentPricePaid?: number;
  declare apartmentTotalPrice?: number;
  declare apartmentRemainingBalance?: number;
  declare apartmentPerTurnPayment?: number;
  declare carStatus: string;
  declare carPricePaid?: number;
  declare carTotalPrice?: number;
  declare carRemainingBalance?: number;
  declare carPerTurnPayment?: number;
  declare furnitureKonyhabutor: boolean;
  declare furnitureMosogep: boolean;
  declare furnitureHutoszekreny: boolean;
  declare furnitureMosogatogep: boolean;
  declare furnitureTuzhely: boolean;
  declare furnitureSzobabutor: boolean;
  declare insuranceLife: boolean;
  declare insuranceHome: boolean;
  declare insuranceCar: boolean;
  declare inHospital: boolean;
  declare hospitalRollAttempts: number;
  declare skipNextRoll: boolean;
  declare extraRollsPending: number;
  declare bankrupt: boolean;
}
defineTypes(GazdalkodjOkosanPlayerSchema, {
  id: 'string',
  name: 'string',
  cash: 'number',
  bankAccountBalance: 'number',
  hasBkvPass: 'boolean',
  position: 'number',
  apartmentStatus: 'string',
  apartmentPricePaid: 'number',
  apartmentTotalPrice: 'number',
  apartmentRemainingBalance: 'number',
  apartmentPerTurnPayment: 'number',
  carStatus: 'string',
  carPricePaid: 'number',
  carTotalPrice: 'number',
  carRemainingBalance: 'number',
  carPerTurnPayment: 'number',
  furnitureKonyhabutor: 'boolean',
  furnitureMosogep: 'boolean',
  furnitureHutoszekreny: 'boolean',
  furnitureMosogatogep: 'boolean',
  furnitureTuzhely: 'boolean',
  furnitureSzobabutor: 'boolean',
  insuranceLife: 'boolean',
  insuranceHome: 'boolean',
  insuranceCar: 'boolean',
  inHospital: 'boolean',
  hospitalRollAttempts: 'number',
  skipNextRoll: 'boolean',
  extraRollsPending: 'number',
  bankrupt: 'boolean',
});

export class GazdalkodjOkosanStateSchema extends Schema {
  declare players: ArraySchema<GazdalkodjOkosanPlayerSchema>;
  declare currentPlayerIndex: number;
  declare turnPhase: string;
  /** ('car'|'apartment')[] — replaceStringArray-jel szinkronizálva, lásd colyseusSyncHelpers.ts. */
  declare pendingMandatoryInstallments: ArraySchema<string>;
  declare lastDiceRoll?: number;
  declare status: string;
  declare winnerId?: string;
  /** One JSON.stringify(LogEntry) per element, push-only — a Hotel `log` mintája. */
  declare log: ArraySchema<string>;
  /** ChanceCard id-k a jelenlegi pakli-sorrendben — a kártyák saját text/effect mezői statikusak, chanceCards.ts-ből olvasva. */
  declare chanceDeckOrder: ArraySchema<string>;
  // GameRoomState fields — every game's Colyseus state carries these.
  declare ready: boolean;
  declare pendingRequests: ArraySchema<PendingJoinRequest>;
}
defineTypes(GazdalkodjOkosanStateSchema, {
  players: [GazdalkodjOkosanPlayerSchema],
  currentPlayerIndex: 'number',
  turnPhase: 'string',
  pendingMandatoryInstallments: ['string'],
  lastDiceRoll: 'number',
  status: 'string',
  winnerId: 'string',
  log: ['string'],
  chanceDeckOrder: ['string'],
  ready: 'boolean',
  pendingRequests: [PendingJoinRequest],
});
