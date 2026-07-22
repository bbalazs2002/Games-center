import type { Room } from 'colyseus.js';
import type { OpaqueGameStateSchema } from '../../../shared/core/OpaqueGameStateSchema';
import type { GameTransport } from './GameTransport';

/**
 * Networked GameTransport — decodes the opaque JSON state produced by
 * src/server/core/GameRoom. Implements the same GameTransport<TState, TAction>
 * interface as LocalGameTransport, so *GamePage components can't tell the
 * difference. See docs/fazis-0b-multiplayer-specifikacio.md §6.2.
 */
export class ColyseusGameTransport<TState, TAction> implements GameTransport<TState, TAction> {
  private state: TState;
  private readonly listeners = new Set<(state: TState) => void>();

  constructor(
    private readonly room: Room<OpaqueGameStateSchema>,
    initialState: TState,
  ) {
    this.state = initialState;
    this.room.onStateChange((networkState) => {
      this.state = JSON.parse(networkState.stateJson) as TState;
      this.listeners.forEach((listener) => listener(this.state));
    });
  }

  getState(): TState {
    return this.state;
  }

  dispatch(action: TAction): void {
    this.room.send('action', action);
  }

  subscribe(listener: (state: TState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
