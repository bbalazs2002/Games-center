import { useEffect, useRef } from 'react';
import type { GameTransport } from '../../../core/transport/GameTransport';
import { chooseGwentAiAction, GWENT_AI_MOVE_DELAY_MS, type GwentAiDifficulty } from '@shared/games/gwent/ai';
import type { GwentAction } from '@shared/games/gwent/engine/actions';
import type { GwentState, PlayerId } from '@shared/games/gwent/engine/state';

/** Which hot-seat player slot (if any) is AI-controlled, and at what difficulty — built once at match start in GwentMatchSetupPage, empty for an all-human game. Only player-2 can ever be AI (player-1 is always human) — see GwentMatchSetupPage.tsx. */
export type HotSeatAiSlots = Partial<Record<PlayerId, GwentAiDifficulty>>;

/**
 * Drives an AI-controlled slot in a hot-seat match — the client-side mirror
 * of GameRoom's maybeTriggerAiMove/tryApplyOneAiMove for online rooms, but
 * scheduled directly against a local GameTransport instead of a Colyseus
 * room (same pattern as useDamaHotSeatAi/useRamsesHotSeatAi). Reuses
 * `chooseGwentAiAction` exactly as-is — that function masks the state itself
 * (see strategy.ts's `stateForAiDecision`), so this hook never has to; it
 * just reads whatever `transport.getState()` gives it, same fair-play
 * guarantee as the online path. See docs/gwent-0e-ai-specifikacio.md §7.
 *
 * No-op (registers nothing) when `aiSlots` is empty, so an all-human hot-seat
 * match is completely unaffected.
 */
export function useGwentHotSeatAi(transport: GameTransport<GwentState, GwentAction> | null, aiSlots: HotSeatAiSlots): void {
  // Read via a ref so a new inline aiSlots object on re-render doesn't force
  // the effect to tear down/reconnect — GwentMatchSetupPage passes a value
  // that's logically fixed for the whole match, but this stays robust either way.
  const aiSlotsRef = useRef(aiSlots);
  aiSlotsRef.current = aiSlots;

  useEffect(() => {
    if (!transport || Object.keys(aiSlots).length === 0) return;
    const activeTransport = transport;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function tryOneMove(): void {
      timer = null;
      if (disposed) return;
      const state = activeTransport.getState();
      for (const [slot, difficulty] of Object.entries(aiSlotsRef.current) as [PlayerId, GwentAiDifficulty][]) {
        const action = chooseGwentAiAction(state, slot, difficulty);
        if (action) {
          activeTransport.dispatch(action);
          return; // the resulting state change re-triggers scheduleIfIdle below
        }
      }
    }

    function scheduleIfIdle(): void {
      if (timer || disposed) return;
      timer = setTimeout(tryOneMove, GWENT_AI_MOVE_DELAY_MS);
    }

    const unsubscribe = activeTransport.subscribe(scheduleIfIdle);
    scheduleIfIdle(); // in case the very first thing to happen (e.g. mulligan) is already AI-controlled

    return () => {
      disposed = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
    // aiSlots itself isn't a dependency on purpose — see aiSlotsRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);
}
