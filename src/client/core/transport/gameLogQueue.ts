/**
 * Durable backlog for `LoggingGameTransport` — real playtest gap found
 * 2026-07-31: local (hot-seat) games are fully playable with only `npm run
 * dev` running (no server dependency by design, see LoggingGameTransport.ts's
 * own doc comment), but its fire-and-forget POST silently no-ops if the
 * server genuinely isn't reachable — so a whole session could go completely
 * unlogged with no trace, contradicting "every playtest is inspectable
 * afterward". This queue persists every log entry to localStorage BEFORE
 * attempting the network call, so a not-yet-confirmed entry survives a lost
 * connection, a closed tab, or a server that only gets started afterward.
 */

export interface QueuedLogEntry {
  gameType: string;
  sessionId: string;
  entry: unknown;
}

const STORAGE_KEY = 'games-center:gamelog-pending';

/** `localStorage` can throw (private browsing, quota, disabled) — losing the backlog is acceptable, crashing the game over it is not. */
export function loadPendingLogEntries(): QueuedLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedLogEntry[]) : [];
  } catch {
    return [];
  }
}

function savePendingLogEntries(entries: QueuedLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Backlog just won't grow further this session — not worth surfacing.
  }
}

export function enqueueLogEntry(item: QueuedLogEntry): void {
  savePendingLogEntries([...loadPendingLogEntries(), item]);
}

/**
 * Drains the backlog strictly in FIFO order via `send`, persisting progress
 * after every confirmed item so a mid-flush failure loses nothing already
 * sent. Re-reads the queue fresh each iteration (rather than snapshotting it
 * up front) so entries enqueued while a flush is in flight get picked up too,
 * instead of waiting for some future trigger. Stops at the first failed send
 * to preserve order — a later entry is never sent ahead of an earlier one.
 */
export async function flushPendingLogEntries(send: (item: QueuedLogEntry) => Promise<boolean>): Promise<void> {
  for (;;) {
    const pending = loadPendingLogEntries();
    if (pending.length === 0) return;
    const [head, ...rest] = pending;
    const sent = await send(head);
    if (!sent) return;
    savePendingLogEntries(rest);
  }
}
