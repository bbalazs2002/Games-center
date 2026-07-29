import { useEffect, useRef } from 'react';
import { chooseDamaAiAction, DAMA_AI_MIN_THINK_DELAY_MS, type DamaAiDifficulty } from '../../../../shared/games/dama/ai';
import type { DamaAction } from '../../../../shared/games/dama/engine/actions';
import type { DamaState, Player } from '../../../../shared/games/dama/engine/state';
import type { GameTransport } from '../../../core/transport/GameTransport';

/** Which of the two fixed LIGHT/DARK slots (if any) is AI-controlled, and at what difficulty — built once at game start in DamaSetupPage, empty for an all-human game. */
export type HotSeatAiSlots = Partial<Record<Player, DamaAiDifficulty>>;

/**
 * Drives an AI-controlled player in a hot-seat game — the client-side mirror
 * of GameRoom's maybeTriggerAiMove/tryApplyOneAiMove for online rooms, but
 * scheduled directly against a local GameTransport instead of a Colyseus
 * room (see docs/dama-0d-ai-specifikacio.md §9). Reuses chooseDamaAiAction
 * exactly as-is; no separate/duplicated decision logic for hot-seat.
 *
 * Unlike Hotel/Ramses's hot-seat AI hooks, this computes the move eagerly
 * (synchronously, right on the state-change event) and only delays the
 * DISPATCH by whatever's left of DAMA_AI_MIN_THINK_DELAY_MS — see the same
 * "low minimum, not a fixed delay" design in DamaRoom.aiMoveDelayMs (§9.3).
 *
 * No-op (registers nothing) when `aiSlots` is empty, so an all-human hot-seat
 * game is completely unaffected.
 */
export function useDamaHotSeatAi(transport: GameTransport<DamaState, DamaAction> | null, aiSlots: HotSeatAiSlots): void {
  // Read via a ref so a new inline aiSlots object on re-render doesn't force
  // the effect to tear down/reconnect — DamaSetupPage passes a value that's
  // logically fixed for the whole game, but this stays robust either way.
  const aiSlotsRef = useRef(aiSlots);
  aiSlotsRef.current = aiSlots;

  useEffect(() => {
    if (!transport || Object.keys(aiSlots).length === 0) return;
    const activeTransport = transport;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function tryOneMove(): void {
      if (disposed) return;
      const state = activeTransport.getState();
      const difficulty = aiSlotsRef.current[state.currentPlayer];
      if (!difficulty) return;

      const start = Date.now();
      const action = chooseDamaAiAction(state, difficulty);
      const elapsedMs = Date.now() - start;
      if (!action) return;

      timer = setTimeout(() => {
        timer = null;
        if (!disposed) activeTransport.dispatch(action);
      }, Math.max(0, DAMA_AI_MIN_THINK_DELAY_MS - elapsedMs));
    }

    const unsubscribe = activeTransport.subscribe(tryOneMove);
    tryOneMove(); // in case the very first player to act is already AI-controlled

    return () => {
      disposed = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
    // aiSlots itself isn't a dependency on purpose — see aiSlotsRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);
}
