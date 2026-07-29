import type { GameTransport } from './GameTransport';

const API_BASE_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:2567';

/**
 * `crypto.randomUUID()` is spec-gated to secure contexts (HTTPS or
 * `localhost`) — opening the dev server via `npm run dev -- --host` from
 * another device on the LAN hits it over plain HTTP, an insecure context,
 * where `crypto.randomUUID` is simply undefined. `crypto.getRandomValues()`
 * has no such restriction, so it's used here to assemble an equivalent v4
 * UUID by hand as a fallback.
 */
function generateSessionId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Wraps any GameTransport and best-effort mirrors every dispatched action +
 * the resulting state to the server as one JSONL line — the local/hot-seat
 * equivalent of GameRoom's own (online-only, opt-in) game logger, both
 * writing into the exact same `logs/games/<gameType>-<id>.jsonl` convention
 * (see docs/hotel-0d-ai-specifikacio.md §4.8, and localGameLogRoutes.ts on
 * the server). Unconditional for local play (no flag to flip, since there's
 * no room-creation step to pass one to) — the point is that every playtest
 * is inspectable afterward, not just deliberately-launched AI analysis runs.
 *
 * Fire-and-forget by design: local/hot-seat play has no server dependency
 * today, and logging must never introduce one — a request failure (server
 * not running, offline, whatever) is silently swallowed, never surfaced to
 * the player or allowed to block `dispatch`.
 *
 * Deliberately doesn't log `actorSlot`/`isAi` the way the server logger does
 * — hot-seat has no per-client "slot" concept (every dispatch is local), and
 * each entry's OWN state already carries `currentPlayerIndex`/`players`, so
 * a reader can always attribute action N to whoever `state.currentPlayerIndex`
 * pointed at in entry N-1.
 */
export class LoggingGameTransport<TState, TAction> implements GameTransport<TState, TAction> {
  private seq = 0;
  private readonly sessionId = generateSessionId();

  constructor(
    private readonly inner: GameTransport<TState, TAction>,
    private readonly gameType: string,
    private readonly authToken: string | null,
  ) {}

  getState(): TState {
    return this.inner.getState();
  }

  dispatch(action: TAction): void {
    this.inner.dispatch(action);
    this.logEntry(action);
  }

  subscribe(listener: (state: TState) => void): () => void {
    return this.inner.subscribe(listener);
  }

  private logEntry(action: TAction): void {
    const entry = { seq: this.seq++, timestamp: new Date().toISOString(), action, state: this.inner.getState() };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) headers.Authorization = `Bearer ${this.authToken}`;
    fetch(`${API_BASE_URL}/api/game-log`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ gameType: this.gameType, sessionId: this.sessionId, entry }),
    }).catch(() => {
      // Best-effort — see class doc comment.
    });
  }
}
