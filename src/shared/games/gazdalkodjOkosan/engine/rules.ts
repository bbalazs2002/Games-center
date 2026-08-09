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

/** A Szerencsekerék mezőn dobással landolva a kártyahúzás kötelező — lásd state.ts pendingMandatoryChanceDraw. */
export function canEndTurn(state: GazdalkodjOkosanState): boolean {
  return state.turnPhase === 'RESOLVING_SPACE' && !state.pendingMandatoryChanceDraw;
}

export function canBuyApartment(state: GazdalkodjOkosanState): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  if (getCurrentSpace(state).type !== 'APARTMENT_PURCHASE') return false;
  const player = getCurrentPlayer(state);
  return player.apartment.kind === 'NONE';
}

/** totalWealth-re néz (nem csak cash) — a fizetés forrása (készpénz/folyószámla) most már megválasztható SETTLE_PAYMENT-kor, lásd reducer.ts requestPayment. */
export function canAffordApartment(player: Player, financed: boolean): boolean {
  return totalWealth(player) >= (financed ? APARTMENT_PURCHASE_TERMS.downPayment : APARTMENT_PURCHASE_TERMS.cashPrice);
}

export function canBuyCar(state: GazdalkodjOkosanState): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  if (getCurrentSpace(state).type !== 'CAR_PURCHASE') return false;
  const player = getCurrentPlayer(state);
  return player.car.kind === 'NONE';
}

/** totalWealth-re néz (nem csak cash) — lásd canAffordApartment. */
export function canAffordCar(player: Player, financed: boolean): boolean {
  return totalWealth(player) >= (financed ? CAR_PURCHASE_TERMS.downPayment : CAR_PURCHASE_TERMS.cashPrice);
}

export function canBuyFurniture(state: GazdalkodjOkosanState, item: FurnitureItemId): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  const space = getCurrentSpace(state);
  if (space.type !== 'FURNITURE_PURCHASE' || !space.furnitureItems?.includes(item)) return false;
  const player = getCurrentPlayer(state);
  if (player.apartment.kind === 'NONE') return false;
  if (player.furniture[item]) return false;
  return totalWealth(player) >= FURNITURE_CATALOG[item].price;
}

/**
 * Nyitás/befizetés a 8-as mezőn kívül csak AWAITING_ROLL/RESOLVING_SPACE
 * fázisban engedélyezett (docs/gazdalkodj-okosan-0a-specifikacio.md §3, "más
 * semmi" a kötelező törlesztés/kártya-megerősítés/fizetés fázisokban) — a
 * mező, nem maga a fázis a döntő tényező a két megengedett fázison belül.
 * Pozitív felsorolás (nem csak AWAITING_MANDATORY_INSTALLMENT kizárása),
 * mert egy Szerencsekártya-hatás elméletileg a 8-as mezőre is mozgathatja a
 * játékost egy még függő AWAITING_PAYMENT/AWAITING_CHANCE_CARD_ACK közben —
 * ilyenkor sem szabad engedni a számlanyitást/befizetést.
 */
export function canOpenBankAccount(state: GazdalkodjOkosanState): boolean {
  if (state.turnPhase !== 'AWAITING_ROLL' && state.turnPhase !== 'RESOLVING_SPACE') return false;
  const player = getCurrentPlayer(state);
  return player.position === BANK_SPACE_INDEX && player.bankAccount === null;
}

export function canDepositToAccount(state: GazdalkodjOkosanState, amount: number): boolean {
  if (amount <= 0) return false;
  if (state.turnPhase !== 'AWAITING_ROLL' && state.turnPhase !== 'RESOLVING_SPACE') return false;
  const player = getCurrentPlayer(state);
  if (player.position !== BANK_SPACE_INDEX || player.bankAccount === null) return false;
  return player.cash >= amount;
}

/**
 * A kivétel mezőtől függetlenül, a legtöbb fázisban bármikor lehetséges —
 * akár egy esedékes törlesztés kifizetéséhez is szükség lehet rá. KIVÉVE
 * AWAITING_PAYMENT alatt: a SETTLE_PAYMENT split már közvetlenül eléri a
 * folyószámlát, egy külön kivétel csak megkerülné a "fizetésen kívül semmi
 * más action nem engedélyezett" szabályt (lásd canSettlePayment/
 * canCancelPayment — ez az EGYETLEN másik predikátum, ami korábban nem
 * gátolt AWAITING_PAYMENT alatt).
 */
export function canWithdrawFromAccount(state: GazdalkodjOkosanState, amount: number): boolean {
  if (amount <= 0 || state.turnPhase === 'AWAITING_PAYMENT') return false;
  const player = getCurrentPlayer(state);
  return (player.bankAccount?.balance ?? 0) >= amount;
}

export function canBuyInsurance(state: GazdalkodjOkosanState, policy: 'life' | 'home' | 'car'): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  if (getCurrentSpace(state).type !== 'INSURANCE') return false;
  const player = getCurrentPlayer(state);
  if (player.insurance[policy]) return false;
  return totalWealth(player) >= INSURANCE_PRICES[policy];
}

export function canBuyBkvPass(state: GazdalkodjOkosanState): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  const player = getCurrentPlayer(state);
  if (player.position !== BKV_PASS_SPACE_INDEX || player.hasBkvPass) return false;
  return totalWealth(player) >= (getSpace(state, BKV_PASS_SPACE_INDEX).amount ?? 0);
}

export function canDrawChanceCard(state: GazdalkodjOkosanState): boolean {
  if (state.turnPhase !== 'RESOLVING_SPACE') return false;
  return getCurrentSpace(state).type === 'CHANCE';
}

/** A húzott Szerencsekártya hatásának kötelező megerősítése — amíg ez a fázis tart, minden más `can*` predikátum blokkolva van (mind RESOLVING_SPACE-t követel). */
export function canAckChanceCard(state: GazdalkodjOkosanState): boolean {
  return state.turnPhase === 'AWAITING_CHANCE_CARD_ACK';
}

/** Egy pendingPayment vár lezárásra — lásd reducer.ts requestPayment/applySettlePayment. */
export function canSettlePayment(state: GazdalkodjOkosanState): boolean {
  return state.turnPhase === 'AWAITING_PAYMENT' && state.pendingPayment !== null;
}

/** Csak önkéntes (BUY_*) fizetési oknál lehet visszalépni — kötelező mezőfizetésnél/törlesztésnél/Szerencsekártya-büntetésnél nincs "mégse" (nincs adósság-/árverés-mechanika ebben a játékban). */
export function canCancelPayment(state: GazdalkodjOkosanState): boolean {
  return canSettlePayment(state) && (state.pendingPayment?.reason.kind.startsWith('BUY_') ?? false);
}
