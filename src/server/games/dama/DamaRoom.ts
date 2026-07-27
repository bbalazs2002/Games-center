import { OpaqueGameStateSchema } from '../../../shared/core/OpaqueGameStateSchema';
import type { DamaAction } from '../../../shared/games/dama/engine/actions';
import { createInitialState } from '../../../shared/games/dama/engine/initialState';
import { reducer } from '../../../shared/games/dama/engine/reducer';
import type { DamaState, Player, Position } from '../../../shared/games/dama/engine/state';
import { GameRoom } from '../../core/GameRoom';
import { pickRandomMove } from './ai/randomMoveStrategy';

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
    return pickRandomMove(state);
  }

  protected syncState(): void {
    this.state.stateJson = JSON.stringify(this.gameState);
  }
}
