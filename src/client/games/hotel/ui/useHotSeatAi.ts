import { useEffect, useRef } from 'react';
import type { HotelAction } from '@shared/games/hotel/engine/actions';
import type { HotelState, PlayerId } from '@shared/games/hotel/engine/state';
import { chooseHotelAiAction, HOTEL_AI_MOVE_DELAY_MS, type HotelAiDifficulty } from '@shared/games/hotel/ai';
import type { GameTransport } from '../../../core/transport/GameTransport';

/** Which hot-seat player slots are AI-controlled, and at what difficulty — built once at game start in HotelSetupPage, empty for an all-human game. */
export type HotSeatAiSlots = Partial<Record<PlayerId, HotelAiDifficulty>>;

/** How often to recheck `isAnimating` while it's true, before acting — short enough that the next action fires promptly once a slide/hop settles, without a tight busy-loop. */
const ANIMATION_POLL_INTERVAL_MS = 150;

/**
 * Drives AI-controlled players in a hot-seat game — the client-side mirror
 * of GameRoom's maybeTriggerAiMove/tryApplyOneAiMove for online rooms, but
 * scheduled directly against a local GameTransport instead of a Colyseus
 * room, since hot-seat has no server (see docs/hotel-0d-ai-specifikacio.md
 * §4.7-4.8's "implementáció utáni feladat" — this is that feature). Reuses
 * chooseHotelAiAction exactly as-is; no separate/duplicated decision logic
 * for hot-seat.
 *
 * `isAnimating` (read via a ref, not a dependency — see aiSlotsRef's own
 * note) gates every action on the 3D board's token animations having
 * actually settled first — without this, the fixed HOTEL_AI_MOVE_DELAY_MS
 * pause alone could fire the NEXT AI action while the previous one's token
 * was still mid-slide, especially with multiple AI players in the same
 * game, where their turns could visibly run into each other — a real
 * playtest report (2026-07-30).
 *
 * No-op (registers nothing) when `aiSlots` is empty, so an all-human hot-seat
 * game is completely unaffected.
 */
export function useHotSeatAi(
  transport: GameTransport<HotelState, HotelAction> | null,
  aiSlots: HotSeatAiSlots,
  isAnimating: boolean,
): void {
  // Read via refs so a new inline aiSlots object or a same-tick animation
  // flip doesn't force the effect to tear down/reconnect — HotelSetupPage
  // passes an aiSlots value that's logically fixed for the whole game, and
  // isAnimating changes far more often than the effect should restart.
  const aiSlotsRef = useRef(aiSlots);
  aiSlotsRef.current = aiSlots;
  const isAnimatingRef = useRef(isAnimating);
  isAnimatingRef.current = isAnimating;

  useEffect(() => {
    if (!transport || Object.keys(aiSlots).length === 0) return;
    const activeTransport = transport;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function tryOneMove(): void {
      timer = null;
      if (disposed) return;
      if (isAnimatingRef.current) {
        timer = setTimeout(tryOneMove, ANIMATION_POLL_INTERVAL_MS);
        return;
      }
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
    // aiSlots/isAnimating aren't dependencies on purpose — see their refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);
}
