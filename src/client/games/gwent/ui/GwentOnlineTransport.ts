import type { GameTransport } from '../../../core/transport/GameTransport';
import type { GwentAction } from '@shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '@shared/games/gwent/engine/state';

export interface PrivateGwentHandPayload {
  hand: CardInstance[];
  mulliganSetAside: CardInstance[];
}

function mergePrivateHand(state: GwentState, myPlayer: PlayerId, payload: PrivateGwentHandPayload): GwentState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === myPlayer ? { ...player, hand: payload.hand, mulliganSetAside: payload.mulliganSetAside } : player,
    ) as GwentState['players'],
  };
}

/**
 * The inverse of MaskedRamsesTransport (Ramses): that class REMOVES
 * information from an already-true state; this one ADDS `myPlayer`'s own
 * real secret (hand + mulliganSetAside — NOT deck, which is masked for
 * everyone including its own owner) back into the already-masked state the
 * network delivers — see docs/gwent-0b-multiplayer-specifikacio.md §5.
 * `inner` (a ColyseusGameTransport over OpaqueGameStateSchema) only ever
 * decodes the NEUTRAL, both-sides-masked view GwentRoom broadcasts on the
 * shared Schema; the real hand arrives separately via the 'privateHand'
 * message (see GwentOnlineGamePage), fed in through `updatePrivateHand`.
 *
 * Keeps its own listener set (unlike a pure pass-through wrapper) because a
 * 'privateHand' update must be able to trigger a re-render on its own, not
 * only when the underlying networked state changes — and caches the merged
 * snapshot so repeated getState() calls stay referentially stable between
 * updates, as useGameTransport's useSyncExternalStore requires (same
 * reasoning as MaskedRamsesTransport's identity-based cache).
 */
export class GwentOnlineTransport implements GameTransport<GwentState, GwentAction> {
  private privatePayload: PrivateGwentHandPayload | null = null;
  private mergedState: GwentState;
  private readonly listeners = new Set<(state: GwentState) => void>();
  private readonly unsubscribeInner: () => void;

  constructor(
    private readonly inner: GameTransport<GwentState, GwentAction>,
    private readonly myPlayer: PlayerId,
  ) {
    this.mergedState = inner.getState();
    this.unsubscribeInner = inner.subscribe(() => this.recomputeAndNotify());
  }

  /** Called by GwentOnlineGamePage's room.onMessage('privateHand', ...) listener. */
  updatePrivateHand(payload: PrivateGwentHandPayload): void {
    this.privatePayload = payload;
    this.recomputeAndNotify();
  }

  private recomputeAndNotify(): void {
    const innerState = this.inner.getState();
    this.mergedState = this.privatePayload ? mergePrivateHand(innerState, this.myPlayer, this.privatePayload) : innerState;
    this.listeners.forEach((listener) => listener(this.mergedState));
  }

  getState(): GwentState {
    return this.mergedState;
  }

  dispatch(action: GwentAction): void {
    this.inner.dispatch(action);
  }

  subscribe(listener: (state: GwentState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Not part of GameTransport — same pattern as ColyseusGameTransport.dispose(), call on unmount. */
  dispose(): void {
    this.unsubscribeInner();
  }
}
