import type { AuthPayload } from '../../auth/jwt';
import { GameRoom, type GameRoomCreateOptions } from '../../core/GameRoom';
import { RamsesStateSchema } from '../../../shared/games/ramses/colyseus/RamsesStateSchema';
import { applyRamsesStateToSchema } from '../../../shared/games/ramses/colyseus/ramsesStateCodec';
import type { RamsesAction } from '../../../shared/games/ramses/engine/actions';
import { createInitialState } from '../../../shared/games/ramses/engine/initialState';
import { reducer } from '../../../shared/games/ramses/engine/reducer';
import { renamePlayer, toPublicRamsesState } from '../../../shared/games/ramses/engine/rules';
import { getCurrentPlayer } from '../../../shared/games/ramses/engine/selectors';
import type { PlayerId, RamsesState } from '../../../shared/games/ramses/engine/state';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;

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

export class RamsesRoom extends GameRoom<RamsesState, RamsesAction, PlayerId, RamsesStateSchema> {
  protected readonly gameType = 'ramses';
  protected reducer = reducer;
  // Placeholder until onCreate resolves the real player count from options —
  // onCreate always reassigns this before the base class ever calls it.
  protected createInitialState = () => createInitialState(placeholderPlayerNames(MIN_PLAYERS));

  async onCreate(options: GameRoomCreateOptions): Promise<void> {
    const playerCount = resolvePlayerCount(options.playerCount);
    this.maxClients = playerCount;
    this.createInitialState = () => createInitialState(placeholderPlayerNames(playerCount));
    await super.onCreate(options);
  }

  protected createColyseusState(): RamsesStateSchema {
    return new RamsesStateSchema();
  }

  protected assignPlayerSlot(joinIndex: number): PlayerId {
    // Matches the engine's own Player.id scheme exactly (see createInitialState) — same convention as HotelRoom.
    return `player-${joinIndex + 1}`;
  }

  protected onPlayerAdmitted(slot: PlayerId, auth: AuthPayload): void {
    this.gameState = renamePlayer(this.gameState, slot, auth.displayName);
  }

  /**
   * Ramses has exactly one action type and no Hotel-style "any non-current
   * player may act" exception — always the current player, matching Dáma's
   * isActionAllowed pattern (action param unused).
   */
  protected isActionAllowed(state: RamsesState, playerSlot: PlayerId): boolean {
    return getCurrentPlayer(state).id === playerSlot;
  }

  protected isValidAction(action: unknown): action is RamsesAction {
    if (typeof action !== 'object' || action === null) return false;
    const candidate = action as Record<string, unknown>;
    return candidate.type === 'SLIDE_PYRAMID' && typeof candidate.fromCellId === 'string';
  }

  /** No AI in Ramses-0b (a separate, later phase — see docs/ramses-0b-specifikacio.md §1) — the room's aiOpponentCount is simply never requested by the client, so this never actually runs. */
  protected computeAiMove(): RamsesAction | null {
    return null;
  }

  protected syncState(): void {
    applyRamsesStateToSchema(this.state, this.gameState);
  }

  /**
   * Overrides the default identity — Ramses has genuinely hidden information
   * (still-covered treasures), so the periodic requestFullSync safety net
   * must send the same masked view syncState() uses, never the raw
   * this.gameState (see docs/ramses-0b-specifikacio.md §3.2).
   */
  protected buildFullSyncPayload(): RamsesState {
    return toPublicRamsesState(this.gameState);
  }
}
