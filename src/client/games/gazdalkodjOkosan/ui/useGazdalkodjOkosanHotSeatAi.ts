import { useEffect, useRef } from 'react';
import type { GazdalkodjOkosanAction } from '@shared/games/gazdalkodjOkosan/engine/actions';
import type { GazdalkodjOkosanState, PlayerId } from '@shared/games/gazdalkodjOkosan/engine/state';
import {
  chooseGazdalkodjOkosanAiAction,
  GAZDALKODJ_OKOSAN_AI_MOVE_DELAY_MS,
  type GazdalkodjOkosanAiDifficulty,
} from '@shared/games/gazdalkodjOkosan/ai';
import type { GameTransport } from '../../../core/transport/GameTransport';

/** Which hot-seat player slots are AI-controlled, and at what difficulty — built once at game start in GazdalkodjOkosanSetupPage, empty for an all-human game. */
export type GazdalkodjOkosanHotSeatAiSlots = Partial<Record<PlayerId, GazdalkodjOkosanAiDifficulty>>;

/**
 * Drives AI-controlled players in a hot-seat game — the client-side mirror
 * of GameRoom's maybeTriggerAiMove/tryApplyOneAiMove for online rooms, but
 * scheduled directly against a local GameTransport instead of a Colyseus
 * room, since hot-seat has no server (Hotel's useHotSeatAi.ts precedent, see
 * docs/gazdalkodj-okosan-0d-ai-specifikacio.md §5). Reuses
 * chooseGazdalkodjOkosanAiAction exactly as-is; no separate/duplicated
 * decision logic for hot-seat.
 *
 * Unlike Hotel's version, there's no animation-completion gate here — this
 * engine has no per-substep callback wiring the way Hotel's 3D token
 * slide/staircase animations do. If overlapping AI turns turn out to be a
 * real visual problem during live verification, the fixed
 * GAZDALKODJ_OKOSAN_AI_MOVE_DELAY_MS pause between actions is the first
 * thing to lean on before adding animation-state plumbing.
 *
 * No-op (registers nothing) when `aiSlots` is empty, so an all-human hot-seat
 * game is completely unaffected.
 */
export function useGazdalkodjOkosanHotSeatAi(
  transport: GameTransport<GazdalkodjOkosanState, GazdalkodjOkosanAction> | null,
  aiSlots: GazdalkodjOkosanHotSeatAiSlots,
): void {
  // Read via a ref so a new inline aiSlots object doesn't force the effect
  // to tear down/reconnect — the setup page passes an aiSlots value that's
  // logically fixed for the whole game.
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
      for (const [slot, difficulty] of Object.entries(aiSlotsRef.current) as [PlayerId, GazdalkodjOkosanAiDifficulty][]) {
        const action = chooseGazdalkodjOkosanAiAction(state, slot, difficulty);
        if (action) {
          activeTransport.dispatch(action);
          return; // the resulting state change re-triggers scheduleIfIdle below
        }
      }
    }

    function scheduleIfIdle(): void {
      if (timer || disposed) return;
      timer = setTimeout(tryOneMove, GAZDALKODJ_OKOSAN_AI_MOVE_DELAY_MS);
    }

    const unsubscribe = activeTransport.subscribe(scheduleIfIdle);
    scheduleIfIdle(); // in case the very first player to act is already AI-controlled

    return () => {
      disposed = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
    // aiSlots isn't a dependency on purpose — see its ref above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);
}
