import type { AuthPayload } from '../../auth/jwt';
import { GameRoom, type GameRoomCreateOptions } from '../../core/GameRoom';
import {
  chooseRamsesAiAction,
  createRevealMemory,
  isRamsesAiDifficulty,
  observeRevealedState,
  RAMSES_AI_MOVE_DELAY_MS,
  type RamsesAiDifficulty,
  type RevealMemory,
} from '../../../shared/games/ramses/ai';
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
const DEFAULT_AI_DIFFICULTY: RamsesAiDifficulty = 'MEDIUM';

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
  // Single, game-global memory — not per-slot, since every participant
  // watches the same shared board (see docs/ramses-0c-ai-specifikacio.md §3.1).
  private readonly aiMemory: RevealMemory = createRevealMemory();
  private aiDifficulty: RamsesAiDifficulty = DEFAULT_AI_DIFFICULTY;

  async onCreate(options: GameRoomCreateOptions): Promise<void> {
    const playerCount = resolvePlayerCount(options.playerCount);
    this.maxClients = playerCount;
    this.createInitialState = () => createInitialState(placeholderPlayerNames(playerCount));
    if (isRamsesAiDifficulty(options.aiDifficulty)) this.aiDifficulty = options.aiDifficulty;
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

  /**
   * `_state` (the raw, unmasked truth GameRoom always calls this with) is
   * deliberately unused — the AI must only ever see what a human player
   * could, via the getter below (see docs/ramses-0c-ai-specifikacio.md §3.2).
   */
  protected computeAiMove(_state: RamsesState, slot: PlayerId): RamsesAction | null {
    return chooseRamsesAiAction(this.getPublicGameState(), this.aiMemory, slot, this.aiDifficulty);
  }

  protected aiMoveDelayMs(): number {
    return RAMSES_AI_MOVE_DELAY_MS;
  }

  protected syncState(): void {
    observeRevealedState(this.aiMemory, this.getPublicGameState());
    applyRamsesStateToSchema(this.state, this.gameState);
  }

  /**
   * The ONE place `this.gameState` gets masked for anything AI/fairness-related
   * — see docs/ramses-0c-ai-specifikacio.md §3.2. Never expose `this.gameState`
   * directly to AI decision-making or memory-observation code.
   */
  private getPublicGameState(): RamsesState {
    return toPublicRamsesState(this.gameState);
  }

  /**
   * Overrides the default identity — Ramses has genuinely hidden information
   * (still-covered treasures), so the periodic requestFullSync safety net
   * must send the same masked view syncState() uses, never the raw
   * this.gameState (see docs/ramses-0b-specifikacio.md §3.2).
   */
  protected buildFullSyncPayload(): RamsesState {
    return this.getPublicGameState();
  }
}
