import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

export interface FeedbackGameContext {
  gameId: string;
  state: unknown;
}

/**
 * Game-agnostic bridge between a running GamePage and the global feedback
 * button (see FeedbackModal.tsx) — a GamePage publishes its own (opaque to
 * this file) state snapshot via `useReportFeedbackContext`, the feedback
 * modal reads back whatever was last published, if anything, and attaches
 * it to a bug/suggestion report as raw JSON. Neither side needs to know the
 * other's shape. See docs/shell-ux-specifikacio.md §4.2.
 */
export interface FeedbackContextStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => FeedbackGameContext | null;
  publish: (context: FeedbackGameContext | null) => void;
}

export function createFeedbackContextStore(): FeedbackContextStore {
  let current: FeedbackGameContext | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return current;
    },
    publish(context) {
      current = context;
      listeners.forEach((listener) => listener());
    },
  };
}

/**
 * Split out of FeedbackContext.tsx so that file only exports the component —
 * a plain hook export alongside it defeats Vite Fast Refresh for the whole
 * file (react-refresh/only-export-components).
 */
export const FeedbackContext = createContext<FeedbackContextStore | null>(null);

function useFeedbackContextStore(): FeedbackContextStore {
  const store = useContext(FeedbackContext);
  if (!store) throw new Error('useFeedbackContextStore must be used within a FeedbackContextProvider');
  return store;
}

/**
 * Called by a GamePage (Hotel/Dáma/Ramses) to publish its own live state as
 * the "what was happening when this report was sent" context — fire and
 * forget, re-published on every state change, cleared on unmount so a
 * report sent from the menu never accidentally attaches a stale game's
 * state.
 */
export function useReportFeedbackContext(gameId: string, state: unknown): void {
  const store = useFeedbackContextStore();
  useEffect(() => {
    store.publish({ gameId, state });
    return () => store.publish(null);
  }, [store, gameId, state]);
}

/** Read by FeedbackModal — the last published `{gameId, state}`, or null outside any game. */
export function useFeedbackGameContext(): FeedbackGameContext | null {
  const store = useFeedbackContextStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
