import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';

interface FeedbackGameContext {
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
interface FeedbackContextStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => FeedbackGameContext | null;
  publish: (context: FeedbackGameContext | null) => void;
}

function createFeedbackContextStore(): FeedbackContextStore {
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

const FeedbackContext = createContext<FeedbackContextStore | null>(null);

export function FeedbackContextProvider({ children }: { children: ReactNode }) {
  const store = useMemo(createFeedbackContextStore, []);
  return <FeedbackContext.Provider value={store}>{children}</FeedbackContext.Provider>;
}

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
