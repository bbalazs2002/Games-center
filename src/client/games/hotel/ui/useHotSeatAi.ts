import { useEffect, useRef } from 'react';
import type { HotelAction } from '../../../../shared/games/hotel/engine/actions';
import type { HotelState, PlayerId } from '../../../../shared/games/hotel/engine/state';
import { chooseHotelAiAction, HOTEL_AI_MOVE_DELAY_MS, type HotelAiDifficulty } from '../../../../shared/games/hotel/ai';
import type { GameTransport } from '../../../core/transport/GameTransport';

/** Which hot-seat player slots are AI-controlled, and at what difficulty — built once at game start in HotelSetupPage, empty for an all-human game. */
export type HotSeatAiSlots = Partial<Record<PlayerId, HotelAiDifficulty>>;

/**
 * Drives AI-controlled players in a hot-seat game — the client-side mirror
 * of GameRoom's maybeTriggerAiMove/tryApplyOneAiMove for online rooms, but
 * scheduled directly against a local GameTransport instead of a Colyseus
 * room, since hot-seat has no server (see docs/hotel-0d-ai-specifikacio.md
 * §4.7-4.8's "implementáció utáni feladat" — this is that feature). Reuses
 * chooseHotelAiAction exactly as-is; no separate/duplicated decision logic
 * for hot-seat.
 *
 * No-op (registers nothing) when `aiSlots` is empty, so an all-human hot-seat
 * game is completely unaffected.
 */
export function useHotSeatAi(transport: GameTransport<HotelState, HotelAction> | null, aiSlots: HotSeatAiSlots): void {
  // Read via a ref so a new inline aiSlots object on re-render doesn't force
  // the effect to tear down/reconnect — HotelSetupPage passes a value that's
  // logically fixed for the whole game, but this stays robust either way.
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
      for (const [slot, difficulty] of Object.entries(aiSlotsRef.current) as [PlayerId, HotelAiDifficulty][]) {
        const action = chooseHotelAiAction(state, slot, difficulty);
        if (action) {
          activeTransport.dispatch(action);
          return; // the resulting state change re-triggers scheduleIfIdle below
        }
      }
    }

    function scheduleIfIdle(): void {
      if (timer || disposed) return;
      timer = setTimeout(tryOneMove, HOTEL_AI_MOVE_DELAY_MS);
    }

    const unsubscribe = activeTransport.subscribe(scheduleIfIdle);
    scheduleIfIdle(); // in case the very first player to act is already AI-controlled

    return () => {
      disposed = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
    // aiSlots itself isn't a dependency on purpose — see aiSlotsRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);
}
