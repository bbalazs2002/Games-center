import { useEffect, useRef } from 'react';
import { useAuth } from '../../shell/auth/useAuth';
import { DEFAULT_SERVER_URL } from '../serverUrl';
import { generateUuid } from '../uuid';

const API_BASE_URL = import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL;
const DEBOUNCE_MS = 2000;

/**
 * Best-effort persistence for a LOCAL (hot-seat) game — replaces the old
 * `useLocalGameLogger`/`LoggingGameTransport` (per-action JSONL-to-file,
 * removed — see localSessionRoutes.ts's doc comment for why). Doesn't wrap
 * the transport anymore: only the LATEST state matters (it already carries
 * the full append-only `log`, same as every online game's periodic DB
 * flush — see GameRoom.flushToDatabase()), so this is a plain debounced
 * "save my current state" side effect, not a per-dispatch interceptor.
 *
 * Genuinely fire-and-forget: no retry queue, no localStorage backlog — if a
 * save fails (server unreachable, offline hot-seat play), the NEXT
 * debounced save just supersedes it. Hot-seat must stay fully playable with
 * no server at all; a failed/never-attempted save must never surface to the
 * player or affect gameplay.
 */
export function useLocalSessionPersistence<TState>(
  gameType: string,
  isLocalMode: boolean,
  state: TState,
  isFinished: boolean,
): void {
  const sessionIdRef = useRef<string>(undefined);
  if (!sessionIdRef.current) sessionIdRef.current = generateUuid();
  const { auth } = useAuth();

  useEffect(() => {
    if (!isLocalMode) return undefined;

    const save = () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
      fetch(`${API_BASE_URL}/api/local-sessions/${sessionIdRef.current}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ gameType, state }),
      }).catch(() => {
        // Fire-and-forget — a failed save is superseded by the next debounced attempt, no backlog needed.
      });
    };

    // The finishing save fires immediately (no debounce) so it isn't lost if
    // the tab closes right after the winning move — every other save is
    // debounced so a fast-moving game (many actions/second, e.g. AI-vs-AI)
    // doesn't fire a request per action.
    const handle = setTimeout(save, isFinished ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [isLocalMode, gameType, state, isFinished, auth?.token]);
}
