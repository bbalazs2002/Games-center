import type { AuthPayload } from '../../auth/jwt';
import { GameRoom, type GameRoomCreateOptions } from '../../core/GameRoom';
import { rollD6 } from '@shared/games/gazdalkodjOkosan/dice';
import type { GazdalkodjOkosanAction } from '@shared/games/gazdalkodjOkosan/engine/actions';
import { createInitialState as createGazdalkodjOkosanInitialState } from '@shared/games/gazdalkodjOkosan/engine/initialState';
import { reducer } from '@shared/games/gazdalkodjOkosan/engine/reducer';
import { getCurrentPlayer, renamePlayer } from '@shared/games/gazdalkodjOkosan/engine/rules';
import type { FurnitureItemId, GazdalkodjOkosanState, PlayerId } from '@shared/games/gazdalkodjOkosan/engine/state';
import { GazdalkodjOkosanStateSchema } from '@shared/games/gazdalkodjOkosan/colyseus/GazdalkodjOkosanStateSchema';
import { applyGazdalkodjOkosanStateToSchema } from '@shared/games/gazdalkodjOkosan/colyseus/gazdalkodjOkosanStateCodec';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const FURNITURE_ITEMS = new Set<FurnitureItemId>(['konyhabutor', 'mosogep', 'hutoszekreny', 'mosogatogep', 'tuzhely', 'szobabutor']);
const INSURANCE_POLICIES = new Set(['life', 'home', 'car']);

function resolvePlayerCount(requested: unknown): number {
  const parsed = typeof requested === 'number' ? Math.trunc(requested) : MIN_PLAYERS;
  return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, parsed));
}

function placeholderPlayerNames(count: number): string[] {
  // Overwritten with the real auth.displayName as each client actually joins
  // — see GameRoom.onPlayerAdmitted; createInitialState() runs once at
  // onCreate, before anyone (not even the creator) has joined yet.
  return Array.from({ length: count }, (_, i) => `${i + 1}. játékos`);
}

// Split into two halves purely to stay under the project's ESLint complexity
// limit — mirrors HotelRoom's isValidMovementOrPropertyAction/
// isValidStaircaseAuctionOrTurnAction split, same reasoning (plain
// per-action-type routing tables, not meaningfully-branching logic).
function isValidMoveOrLoanAction(candidate: Record<string, unknown>): boolean | undefined {
  switch (candidate.type) {
    case 'ROLL_MOVE_DICE':
      return typeof candidate.value === 'number';
    case 'PAY_APARTMENT_INSTALLMENT':
    case 'PAY_CAR_INSTALLMENT':
      return candidate.amount === undefined || typeof candidate.amount === 'number';
    case 'BUY_APARTMENT':
    case 'BUY_CAR':
      return typeof candidate.financed === 'boolean';
    default:
      return undefined;
  }
}

function isValidPurchaseOrBankAction(candidate: Record<string, unknown>): boolean | undefined {
  switch (candidate.type) {
    case 'BUY_FURNITURE':
      return typeof candidate.item === 'string' && FURNITURE_ITEMS.has(candidate.item as FurnitureItemId);
    case 'DEPOSIT_TO_ACCOUNT':
    case 'WITHDRAW_FROM_ACCOUNT':
      return typeof candidate.amount === 'number';
    case 'BUY_INSURANCE':
      return typeof candidate.policy === 'string' && INSURANCE_POLICIES.has(candidate.policy);
    default:
      return undefined;
  }
}

function isValidServiceOrTurnAction(candidate: Record<string, unknown>): boolean | undefined {
  switch (candidate.type) {
    case 'OPEN_BANK_ACCOUNT':
    case 'BUY_BKV_PASS':
    case 'DRAW_CHANCE_CARD':
    case 'ACK_CHANCE_CARD':
    case 'END_TURN':
      return true;
    default:
      return undefined;
  }
}

export class GazdalkodjOkosanRoom extends GameRoom<GazdalkodjOkosanState, GazdalkodjOkosanAction, PlayerId, GazdalkodjOkosanStateSchema> {
  protected readonly gameType = 'gazdalkodj-okosan';
  protected reducer = reducer;
  // Placeholder until onCreate resolves the real player count from options —
  // onCreate always reassigns this before the base class ever calls it.
  protected createInitialState = () => createGazdalkodjOkosanInitialState(placeholderPlayerNames(MIN_PLAYERS));

  async onCreate(options: GameRoomCreateOptions): Promise<void> {
    const playerCount = resolvePlayerCount(options.playerCount);
    this.maxClients = playerCount;
    this.createInitialState = () => createGazdalkodjOkosanInitialState(placeholderPlayerNames(playerCount));
    await super.onCreate(options);
  }

  protected createColyseusState(): GazdalkodjOkosanStateSchema {
    return new GazdalkodjOkosanStateSchema();
  }

  protected assignPlayerSlot(joinIndex: number): PlayerId {
    // Matches the engine's own Player.id scheme exactly (see createInitialState).
    return `player-${joinIndex + 1}`;
  }

  protected onPlayerAdmitted(slot: PlayerId, auth: AuthPayload): void {
    this.gameState = renamePlayer(this.gameState, slot, auth.displayName);
  }

  /** No exception here (unlike Hotel's auction bidding) — every action implicitly targets the current player. */
  protected isActionAllowed(state: GazdalkodjOkosanState, playerSlot: PlayerId): boolean {
    return getCurrentPlayer(state).id === playerSlot;
  }

  protected isValidAction(action: unknown): action is GazdalkodjOkosanAction {
    if (typeof action !== 'object' || action === null) return false;
    const candidate = action as Record<string, unknown>;
    return isValidMoveOrLoanAction(candidate) ?? isValidPurchaseOrBankAction(candidate) ?? isValidServiceOrTurnAction(candidate) ?? false;
  }

  /**
   * The client-supplied dice `value` is never trusted for online play — a
   * modified client could otherwise always send the best possible roll. The
   * server regenerates it here (Hotel's precedent). Hot-seat never goes
   * through GameRoom at all, so it's unaffected.
   */
  protected resolveServerAction(action: GazdalkodjOkosanAction): GazdalkodjOkosanAction {
    if (action.type === 'ROLL_MOVE_DICE') return { ...action, value: rollD6() };
    return action;
  }

  protected computeAiMove(): GazdalkodjOkosanAction | null {
    return null; // AI ellenfél nincs ebben a körben (0d feladata)
  }

  protected syncState(): void {
    applyGazdalkodjOkosanStateToSchema(this.state, this.gameState);
  }
}
