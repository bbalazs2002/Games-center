import type { AuthPayload } from '../../auth/jwt';
import { GameRoom, type GameRoomCreateOptions } from '../../core/GameRoom';
import { HotelStateSchema } from '../../../shared/games/hotel/colyseus/HotelStateSchema';
import { applyHotelStateToSchema } from '../../../shared/games/hotel/colyseus/hotelStateCodec';
import type { HotelAction } from '../../../shared/games/hotel/engine/actions';
import { createInitialState as createHotelInitialState } from '../../../shared/games/hotel/engine/initialState';
import { reducer } from '../../../shared/games/hotel/engine/reducer';
import { getCurrentPlayer, updatePlayer } from '../../../shared/games/hotel/engine/rules';
import type { ConstructionPlanItem, HotelState, PlayerId } from '../../../shared/games/hotel/engine/state';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const PERMIT_DIE_FACES = new Set(['GREEN', 'FREE', 'DOUBLE', 'RED']);

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

function isConstructionPlanItem(value: unknown): value is ConstructionPlanItem {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.lotId === 'string' &&
    typeof candidate.buildingCount === 'number' &&
    (candidate.buildGarden === undefined || typeof candidate.buildGarden === 'boolean')
  );
}

// Split into two halves purely to stay under the project's ESLint complexity
// limit — mirrors reducer.ts's dispatchMovementAndProperty/
// dispatchStaircaseAuctionAndTurn split, same reasoning (plain per-action-type
// routing tables, not meaningfully-branching logic).
function isValidMovementOrPropertyAction(candidate: Record<string, unknown>): boolean | undefined {
  switch (candidate.type) {
    case 'ROLL_MOVE_DICE':
    case 'ROLL_NIGHTS':
      return typeof candidate.value === 'number';
    case 'BUY_LOT':
      return typeof candidate.lotId === 'string';
    case 'START_CONSTRUCTION':
      return Array.isArray(candidate.plan) && candidate.plan.every(isConstructionPlanItem);
    case 'ROLL_BUILDING_PERMIT':
      return typeof candidate.value === 'string' && PERMIT_DIE_FACES.has(candidate.value);
    default:
      return undefined;
  }
}

function isValidStaircaseAuctionOrTurnAction(candidate: Record<string, unknown>): boolean | undefined {
  switch (candidate.type) {
    case 'BUY_STAIRCASE_RIGHT':
    case 'CHOOSE_FREE_STAIRCASE_SPACE':
      return typeof candidate.lotId === 'string' && typeof candidate.spaceId === 'string';
    case 'START_AUCTION':
      return typeof candidate.lotId === 'string';
    case 'PLACE_BID':
      return typeof candidate.bidderId === 'string' && typeof candidate.amount === 'number';
    case 'PASS_BID':
      return typeof candidate.bidderId === 'string';
    case 'FORFEIT':
    case 'END_TURN':
      return true;
    default:
      return undefined;
  }
}

export class HotelRoom extends GameRoom<HotelState, HotelAction, PlayerId, HotelStateSchema> {
  protected readonly gameType = 'hotel';
  protected reducer = reducer;
  // Placeholder until onCreate resolves the real player count from options —
  // onCreate always reassigns this before the base class ever calls it.
  protected createInitialState = () => createHotelInitialState(placeholderPlayerNames(MIN_PLAYERS));

  async onCreate(options: GameRoomCreateOptions): Promise<void> {
    const playerCount = resolvePlayerCount(options.playerCount);
    this.maxClients = playerCount;
    this.createInitialState = () => createHotelInitialState(placeholderPlayerNames(playerCount));
    await super.onCreate(options);
  }

  protected createColyseusState(): HotelStateSchema {
    return new HotelStateSchema();
  }

  protected assignPlayerSlot(joinIndex: number): PlayerId {
    // Matches the engine's own Player.id scheme exactly (see createInitialState)
    // — no separate, parallel slot-naming convention needed, unlike Dáma's
    // LIGHT/DARK (which has no equivalent in DamaState).
    return `player-${joinIndex + 1}`;
  }

  protected onPlayerAdmitted(slot: PlayerId, auth: AuthPayload): void {
    this.gameState = updatePlayer(this.gameState, slot, { name: auth.displayName });
  }

  /**
   * The one exception to "only the current player may act": PLACE_BID/PASS_BID
   * can come from any non-auctioneer player, identified by the action's own
   * `bidderId` — see docs/hotel-0a-specifikacio.md §9.1 and
   * docs/hotel-0b-multiplayer-specifikacio.md §6.4.
   */
  protected isActionAllowed(state: HotelState, playerSlot: PlayerId, action: HotelAction): boolean {
    if (action.type === 'PLACE_BID' || action.type === 'PASS_BID') {
      return action.bidderId === playerSlot;
    }
    return getCurrentPlayer(state).id === playerSlot;
  }

  protected isValidAction(action: unknown): action is HotelAction {
    if (typeof action !== 'object' || action === null) return false;
    const candidate = action as Record<string, unknown>;
    return isValidMovementOrPropertyAction(candidate) ?? isValidStaircaseAuctionOrTurnAction(candidate) ?? false;
  }

  /** Hotel-0d's job — no AI opponent in Hotel-0b at all (see docs/hotel-0b-multiplayer-specifikacio.md §1). */
  protected computeAiMove(): HotelAction | null {
    return null;
  }

  protected syncState(): void {
    applyHotelStateToSchema(this.state, this.gameState);
  }
}
