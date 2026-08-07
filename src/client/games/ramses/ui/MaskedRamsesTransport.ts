import type { GameTransport } from '../../../core/transport/GameTransport';
import type { RamsesAction } from '@shared/games/ramses/engine/actions';
import { toPublicRamsesState } from '@shared/games/ramses/engine/rules';
import type { RamsesState } from '@shared/games/ramses/engine/state';

/**
 * Wraps ANY RamsesState transport (local or networked) so getState()/subscribe()
 * ALWAYS return the masked, publicly-visible state — dispatch passes straight
 * through (the underlying reducer still needs the true state to resolve
 * outcomes; only what's HANDED OUT is masked). Used unconditionally by
 * RamsesGamePage, so no consumer (rendering OR the hot-seat AI hook) ever
 * holds a reference to the true state — see
 * docs/ramses-0c-ai-specifikacio.md §3.2. This is what closes the gap that
 * existed since Ramses-0a: hot-seat's LocalGameTransport held the full,
 * unmasked state in the browser's JS heap with nothing filtering it before
 * it reached rendering.
 *
 * Harmless/idempotent when wrapping an already-masked online transport
 * (ColyseusGameTransport's decode already masks) — re-masking a masked
 * state is a no-op, just consistency by construction instead of "online
 * happens to already handle this elsewhere."
 *
 * Caches the masked snapshot by the inner state's object identity, only
 * recomputing when it actually changes — required by useGameTransport's
 * useSyncExternalStore, which expects getState() to return a referentially
 * STABLE snapshot when nothing changed; recomputing a fresh object on every
 * call (as an early version of this class did) makes React think the store
 * changes on every render, causing an infinite update-depth loop.
 */
export class MaskedRamsesTransport implements GameTransport<RamsesState, RamsesAction> {
  private lastInnerState: RamsesState | null = null;
  private lastMaskedState: RamsesState | null = null;

  constructor(private readonly inner: GameTransport<RamsesState, RamsesAction>) {}

  getState(): RamsesState {
    const innerState = this.inner.getState();
    if (innerState !== this.lastInnerState) {
      this.lastInnerState = innerState;
      this.lastMaskedState = toPublicRamsesState(innerState);
    }
    return this.lastMaskedState!;
  }

  dispatch(action: RamsesAction): void {
    this.inner.dispatch(action);
  }

  subscribe(listener: (state: RamsesState) => void): () => void {
    return this.inner.subscribe(() => listener(this.getState()));
  }
}
