import { DEFAULT_SERVER_URL } from '../serverUrl';
import type { GameTransport } from './GameTransport';
import { enqueueLogEntry, flushPendingLogEntries, type QueuedLogEntry } from './gameLogQueue';

const API_BASE_URL = import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL;

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
 * Never blocks/breaks gameplay over logging: entries are persisted to a
 * localStorage backlog (`gameLogQueue.ts`) BEFORE any network attempt, and
 * only removed once the server actually confirms receipt. This is a fix for
 * a real gap (2026-07-31 playtest): local hot-seat play has no server
 * dependency by design, so a whole session played with only `npm run dev`
 * running (no `server:dev`) previously vanished with zero trace the instant
 * the fire-and-forget POST failed — silently, since that's also exactly what
 * a normal transient network hiccup should do. The backlog fixes the "gone
 * forever" part without giving up the "never blocks the game" part: a failed
 * send just leaves the entry queued for the NEXT flush attempt (every
 * subsequent dispatch, and once more when a new `LoggingGameTransport` is
 * constructed — e.g. the next time any local game is opened, picking up
 * yesterday's still-queued backlog once the server happens to be up again).
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
  ) {
    void flushPendingLogEntries((item) => this.send(item));
  }

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
    const item: QueuedLogEntry = { gameType: this.gameType, sessionId: this.sessionId, entry };
    enqueueLogEntry(item);
    void flushPendingLogEntries((queued) => this.send(queued));
  }

  /** Resolves `true` only once the server has actually confirmed the write — never throws. */
  private async send(item: QueuedLogEntry): Promise<boolean> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) headers.Authorization = `Bearer ${this.authToken}`;
    try {
      const response = await fetch(`${API_BASE_URL}/api/game-log`, { method: 'POST', headers, body: JSON.stringify(item) });
      return response.ok;
    } catch {
      return false;
    }
  }
}
