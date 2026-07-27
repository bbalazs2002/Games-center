import { useEffect, useRef } from 'react';
import type { GameTransport } from '../../../core/transport/GameTransport';
import {
  chooseRamsesAiAction,
  createRevealMemory,
  observeRevealedState,
  RAMSES_AI_MOVE_DELAY_MS,
  type RamsesAiDifficulty,
  type RevealMemory,
} from '../../../../shared/games/ramses/ai';
import type { RamsesAction } from '../../../../shared/games/ramses/engine/actions';
import type { PlayerId, RamsesState } from '../../../../shared/games/ramses/engine/state';

/** Which hot-seat player slots are AI-controlled, and at what difficulty — built once at game start in RamsesSetupPage, empty for an all-human game. */
export type HotSeatAiSlots = Partial<Record<PlayerId, RamsesAiDifficulty>>;

/**
 * Drives AI-controlled players in a hot-seat game — the client-side mirror
 * of GameRoom's maybeTriggerAiMove/tryApplyOneAiMove for online rooms, but
 * scheduled directly against a local GameTransport instead of a Colyseus
 * room (see docs/ramses-0c-ai-specifikacio.md §5). Reuses chooseRamsesAiAction
 * exactly as-is; no separate/duplicated decision logic for hot-seat.
 *
 * `transport` is expected to already be a MaskedRamsesTransport (wrapped by
 * RamsesGamePage before this hook is called) — this hook itself never masks,
 * it just reads whatever transport.getState() gives it, trusting the caller
 * (see docs/ramses-0c-ai-specifikacio.md §3.2/§5).
 *
 * Also maintains the shared reveal-memory: every observed state change
 * (human OR AI move alike, including the very first state at mount) is fed
 * into `observeRevealedState`, not just the AI's own turns — an attentive
 * human would remember what any player's move reveals, and the AI models
 * that.
 *
 * No-op (registers nothing, memory still tracked) when `aiSlots` is empty,
 * so an all-human hot-seat game is unaffected beyond the (harmless) memory
 * bookkeeping.
 */
export function useRamsesHotSeatAi(transport: GameTransport<RamsesState, RamsesAction> | null, aiSlots: HotSeatAiSlots): void {
  const memoryRef = useRef<RevealMemory>(createRevealMemory());
  // Read via a ref so a new inline aiSlots object on re-render doesn't force
  // the effect to tear down/reconnect — RamsesSetupPage passes a value that's
  // logically fixed for the whole game, but this stays robust either way.
  const aiSlotsRef = useRef(aiSlots);
  aiSlotsRef.current = aiSlots;

  useEffect(() => {
    if (!transport) return;
    const activeTransport = transport;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function tryOneMove(): void {
      timer = null;
      if (disposed) return;
      const state = activeTransport.getState();
      for (const [slot, difficulty] of Object.entries(aiSlotsRef.current) as [PlayerId, RamsesAiDifficulty][]) {
        const action = chooseRamsesAiAction(state, memoryRef.current, slot, difficulty);
        if (action) {
          activeTransport.dispatch(action);
          return; // the resulting state change re-triggers scheduleIfIdle below
        }
      }
    }

    function scheduleIfIdle(): void {
      if (timer || disposed) return;
      timer = setTimeout(tryOneMove, RAMSES_AI_MOVE_DELAY_MS);
    }

    function onStateChange(state: RamsesState): void {
      observeRevealedState(memoryRef.current, state);
      scheduleIfIdle();
    }

    const unsubscribe = activeTransport.subscribe(onStateChange);
    observeRevealedState(memoryRef.current, activeTransport.getState()); // eager: the initial state is an observation too
    scheduleIfIdle(); // in case the very first player to act is already AI-controlled

    return () => {
      disposed = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
    // aiSlots itself isn't a dependency on purpose — see aiSlotsRef above.
  }, [transport]);
}
