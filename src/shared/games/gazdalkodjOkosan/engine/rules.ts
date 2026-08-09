import { APARTMENT_PURCHASE_TERMS, BANK_SPACE_INDEX, BKV_PASS_SPACE_INDEX, CAR_PURCHASE_TERMS, INSURANCE_PRICES, WIN_CONDITION_MIN_WEALTH } from './boardConfig';
import { ALL_FURNITURE_ITEMS, FURNITURE_CATALOG } from './furnitureCatalog';
import type { BoardSpace, FurnitureItemId, GazdalkodjOkosanState, LogEntry, OwnershipStatus, Player, PlayerId } from './state';

export function getPlayer(state: GazdalkodjOkosanState, playerId: PlayerId): Player {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  return player;
}

export function getCurrentPlayer(state: GazdalkodjOkosanState): Player {
  return state.players[state.currentPlayerIndex];
}

export function updatePlayer(state: GazdalkodjOkosanState, playerId: PlayerId, patch: Partial<Player>): GazdalkodjOkosanState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)) };
}

/**
 * A placeholder ("1. játékos" stb.) lecserélése a csatlakozáskor ismertté
 * váló valódi névre — `GameRoom.onPlayerAdmitted` hívja online módban, mivel
 * `createInitialState` még senki csatlakozása előtt lefut. A Ramses
 * `renamePlayer`-jének megfelelője (docs/ramses-0b-specifikacio.md §3.5).
 */
export function renamePlayer(state: GazdalkodjOkosanState, playerId: PlayerId, name: string): GazdalkodjOkosanState {
  return updatePlayer(state, playerId, { name });
}

export function getSpace(state: GazdalkodjOkosanState, index: number): BoardSpace {
  return state.board[index];
}

export function getCurrentSpace(state: GazdalkodjOkosanState): BoardSpace {
  return getSpace(state, getCurrentPlayer(state).position);
}

/** Appends one event to the game log — see LogEntry. Log is append-only, so its index is a stable React key. */
export function appendLog(state: GazdalkodjOkosanState, entry: LogEntry): GazdalkodjOkosanState {
  return { ...state, log: [...state.log, entry] };
}

/** Készpénz + folyószámla-egyenleg együtt — a győzelmi feltétel "rendelkezik... euróval" kritériuma erre vonatkozik. */
export function totalWealth(player: Player): number {
  return player.cash + (player.bankAccount?.balance ?? 0);
}

export function isFullyOwned(status: OwnershipStatus): boolean {
  return status.kind === 'OWNED_CASH' || (status.kind === 'FINANCED' && status.plan.remainingBalance <= 0);
}

export function hasAllFurniture(player: Player): boolean {
  return ALL_FURNITURE_ITEMS.every((item) => player.furniture[item]);
}

/** docs/gazdalkodj-okosan-0a-specifikacio.md §2.1/§2.3 — a szabálykönyv szó szerinti győzelmi feltétele. */
export function hasWon(player: Player): boolean {
  return (
    isFullyOwned(player.apartment) &&
    hasAllFurniture(player) &&
    isFullyOwned(player.car) &&
    player.insurance.car &&
    totalWealth(player) >= WIN_CONDITION_MIN_WEALTH
  );
}

export function nextActivePlayerIndex(state: GazdalkodjOkosanState): number {
  const total = state.players.length;
  let index = state.currentPlayerIndex;
  for (let i = 0; i < total; i += 1) {
    index = (index + 1) % total;
    if (!state.players[index].bankrupt) return index;
  }
  return state.currentPlayerIndex;
}

export function activePlayerCount(state: GazdalkodjOkosanState): number {
  return state.players.filter((p) => !p.bankrupt).length;
}

// ---------------------------------------------------------------------------
// Action legality — a rules.ts predikátumai az egyetlen forrás arra, hogy "ez
// az action/választás most jogos-e." A reducer apply* függvényei pontosan
// ezekre kapuznak (egy érvénytelen action akkor is elutasításra kerül, ha nem
// a UI-ból jött), a selectors.ts getValidActions()-je pedig ugyanezeket a
// ellenőrzéseket teszi elérhetővé a UI-nak (és egy jövőbeli AI-nak) — Hotel
// mintáját követve.
// ---------------------------------------------------------------------------

export function canRollMoveDice(state: GazdalkodjOkosanState): boolean {
  return state.turnPhase === 'AWAITING_ROLL';
}

export function canPayInstallment(state: GazdalkodjOkosanState, loan: 'car' | 'apartment'): boolean {
  return state.turnPhase === 'AWAITING_MANDATORY_INSTALLMENT' && state.pendingMandatoryInstallments.includes(loan);
}

export function canEndTurn(state: GazdalkodjOkosanState): boolean {
  return state.turnPhase === 'RESOLVING_SPACE';
}

export function canBuyApartment(state: GazdalkodjOkosanState): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  if (getCurrentSpace(state).type !== 'APARTMENT_PURCHASE') return false;
  const player = getCurrentPlayer(state);
  return player.apartment.kind === 'NONE';
}

export function canAffordApartment(player: Player, financed: boolean): boolean {
  return player.cash >= (financed ? APARTMENT_PURCHASE_TERMS.downPayment : APARTMENT_PURCHASE_TERMS.cashPrice);
}

export function canBuyCar(state: GazdalkodjOkosanState): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  if (getCurrentSpace(state).type !== 'CAR_PURCHASE') return false;
  const player = getCurrentPlayer(state);
  return player.car.kind === 'NONE';
}

export function canAffordCar(player: Player, financed: boolean): boolean {
  return player.cash >= (financed ? CAR_PURCHASE_TERMS.downPayment : CAR_PURCHASE_TERMS.cashPrice);
}

export function canBuyFurniture(state: GazdalkodjOkosanState, item: FurnitureItemId): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  const space = getCurrentSpace(state);
  if (space.type !== 'FURNITURE_PURCHASE' || !space.furnitureItems?.includes(item)) return false;
  const player = getCurrentPlayer(state);
  if (player.apartment.kind === 'NONE') return false;
  if (player.furniture[item]) return false;
  return player.cash >= FURNITURE_CATALOG[item].price;
}

/**
 * Nyitás/befizetés a 8-as mezőn kívül csak `AWAITING_MANDATORY_INSTALLMENT`
 * alatt van kizárva — a kötelező törlesztés fázisban KIZÁRÓLAG a
 * PAY_*_INSTALLMENT action(ök) engedélyezettek (docs/gazdalkodj-okosan-0a-specifikacio.md
 * §3, "más semmi"). Egyébként (AWAITING_ROLL/RESOLVING_SPACE) engedélyezett,
 * ha a játékos épp a 8-as mezőn áll — a mező, nem a fázis a döntő tényező.
 */
export function canOpenBankAccount(state: GazdalkodjOkosanState): boolean {
  if (state.turnPhase === 'AWAITING_MANDATORY_INSTALLMENT') return false;
  const player = getCurrentPlayer(state);
  return player.position === BANK_SPACE_INDEX && player.bankAccount === null;
}

export function canDepositToAccount(state: GazdalkodjOkosanState, amount: number): boolean {
  if (amount <= 0 || state.turnPhase === 'AWAITING_MANDATORY_INSTALLMENT') return false;
  const player = getCurrentPlayer(state);
  if (player.position !== BANK_SPACE_INDEX || player.bankAccount === null) return false;
  return player.cash >= amount;
}

/** A kivétel mezőtől ÉS fázistól függetlenül, bármikor lehetséges — akár egy esedékes törlesztés kifizetéséhez is szükség lehet rá. */
export function canWithdrawFromAccount(state: GazdalkodjOkosanState, amount: number): boolean {
  if (amount <= 0) return false;
  const player = getCurrentPlayer(state);
  return (player.bankAccount?.balance ?? 0) >= amount;
}

export function canBuyInsurance(state: GazdalkodjOkosanState, policy: 'life' | 'home' | 'car'): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  if (getCurrentSpace(state).type !== 'INSURANCE') return false;
  const player = getCurrentPlayer(state);
  if (player.insurance[policy]) return false;
  return player.cash >= INSURANCE_PRICES[policy];
}

export function canBuyBkvPass(state: GazdalkodjOkosanState): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  const player = getCurrentPlayer(state);
  if (player.position !== BKV_PASS_SPACE_INDEX || player.hasBkvPass) return false;
  return player.cash >= (getSpace(state, BKV_PASS_SPACE_INDEX).amount ?? 0);
}

export function canDrawChanceCard(state: GazdalkodjOkosanState): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  return getCurrentSpace(state).type === 'CHANCE';
}

/** A húzott Szerencsekártya hatásának kötelező megerősítése — amíg ez a fázis tart, minden más `can*` predikátum blokkolva van (mind RESOLVING_SPACE-t követel). */
export function canAckChanceCard(state: GazdalkodjOkosanState): boolean {
  return state.turnPhase === 'AWAITING_CHANCE_CARD_ACK';
}
