import { OpaqueGameStateSchema } from '@shared/core/OpaqueGameStateSchema';
import {
  chooseDamaAiAction,
  DAMA_AI_MIN_THINK_DELAY_MS,
  isDamaAiDifficulty,
  type DamaAiDifficulty,
} from '@shared/games/dama/ai';
import type { DamaAction } from '@shared/games/dama/engine/actions';
import { createInitialState } from '@shared/games/dama/engine/initialState';
import { reducer } from '@shared/games/dama/engine/reducer';
import type { DamaState, Player, Position } from '@shared/games/dama/engine/state';
import { GameRoom, type GameRoomCreateOptions } from '../../core/GameRoom';

function isPosition(value: unknown): value is Position {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.row === 'number' && typeof candidate.col === 'number';
}

export class DamaRoom extends GameRoom<DamaState, DamaAction, Player> {
  maxClients = 2;

  protected readonly gameType = 'dama';
  protected reducer = reducer;
  protected createInitialState = createInitialState;
  private aiDifficulty: DamaAiDifficulty = 'MEDIUM';
  // Updated by computeAiMove whenever it actually runs a search — read by
  // aiMoveDelayMs() for the NEXT move. GameRoom queries aiMoveDelayMs()
  // BEFORE computing a move (see GameRoom.maybeTriggerAiMove), so the exact
  // upcoming think-time can't be known in advance; using the PREVIOUS move's
  // measured time is a close approximation within one game (the difficulty,
  // and therefore the typical search cost, stays constant for the whole
  // room) without needing any GameRoom core change. See
  // docs/dama-0d-ai-specifikacio.md §9.3.
  private lastAiThinkElapsedMs = 0;

  async onCreate(options: GameRoomCreateOptions): Promise<void> {
    if (isDamaAiDifficulty(options.aiDifficulty)) this.aiDifficulty = options.aiDifficulty;
    await super.onCreate(options);
  }

  protected createColyseusState(): OpaqueGameStateSchema {
    return new OpaqueGameStateSchema();
  }

  protected assignPlayerSlot(joinIndex: number): Player {
    return joinIndex === 0 ? 'LIGHT' : 'DARK';
  }

  protected isActionAllowed(state: DamaState, playerSlot: Player): boolean {
    // The action itself is irrelevant here — Dáma has no exception to "only
    // the current player may act" (unlike Hotel's auction bidding), so this
    // reduces to the old isPlayersTurn check.
    return state.currentPlayer === playerSlot;
  }

  protected isValidAction(action: unknown): action is DamaAction {
    if (typeof action !== 'object' || action === null) return false;
    const candidate = action as Record<string, unknown>;
    return candidate.type === 'MOVE' && isPosition(candidate.from) && isPosition(candidate.to);
  }

  protected computeAiMove(state: DamaState, slot: Player): DamaAction | null {
    if (state.currentPlayer !== slot) return null;
    const start = Date.now();
    const action = chooseDamaAiAction(state, this.aiDifficulty);
    this.lastAiThinkElapsedMs = Date.now() - start;
    return action;
  }

  protected aiMoveDelayMs(): number {
    return Math.max(0, DAMA_AI_MIN_THINK_DELAY_MS - this.lastAiThinkElapsedMs);
  }

  protected syncState(): void {
    this.state.stateJson = JSON.stringify(this.gameState);
  }
}
