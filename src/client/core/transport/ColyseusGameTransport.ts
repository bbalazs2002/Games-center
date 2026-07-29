import type { Room } from 'colyseus.js';
import type { GameTransport } from './GameTransport';

/** How often to ask the server for a full-state reconciliation — see docs/hotel-0b-multiplayer-specifikacio.md §5.1/2. */
const FULL_SYNC_INTERVAL_MS = 60000;

/**
 * Networked GameTransport — decodes whatever wire-shape `TColyseusState` a
 * game's GameRoom subclass chose (opaque JSON blob for Dáma, a real per-field
 * `@colyseus/schema` for Hotel) into the plain `TState` the engine/UI expect,
 * via the caller-supplied `decode`. Implements the same
 * GameTransport<TState, TAction> interface as LocalGameTransport, so
 * *GamePage components can't tell the difference. See
 * docs/dama-0b-multiplayer-specifikacio.md §6.2 and
 * docs/hotel-0b-multiplayer-specifikacio.md §6.3.
 *
 * Also runs a periodic `requestFullSync`/`fullSync` round-trip as a safety
 * net against a hypothetical missed/corrupted per-field delta — harmless
 * (if redundant) for opaque-JSON games, where every sync is already a full
 * snapshot. Call `dispose()` when the owning component unmounts to stop the
 * timer; this is deliberately NOT part of the game-agnostic `GameTransport`
 * interface (`LocalGameTransport` has nothing to dispose), same reasoning as
 * why room-management concerns already live outside it.
 */
export class ColyseusGameTransport<TState, TAction, TColyseusState = unknown>
  implements GameTransport<TState, TAction>
{
  private state: TState;
  private readonly listeners = new Set<(state: TState) => void>();
  private readonly fullSyncInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly room: Room<TColyseusState>,
    initialState: TState,
    private readonly decode: (colyseusState: TColyseusState) => TState,
  ) {
    this.state = initialState;
    this.room.onStateChange((networkState) => {
      this.state = this.decode(networkState);
      this.listeners.forEach((listener) => listener(this.state));
    });
    this.room.onMessage('fullSync', (payload: string) => {
      this.state = JSON.parse(payload) as TState;
      this.listeners.forEach((listener) => listener(this.state));
    });
    this.fullSyncInterval = setInterval(() => this.room.send('requestFullSync'), FULL_SYNC_INTERVAL_MS);
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

  dispose(): void {
    clearInterval(this.fullSyncInterval);
  }
}
