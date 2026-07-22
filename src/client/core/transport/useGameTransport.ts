import { useSyncExternalStore } from 'react';
import type { GameTransport } from './GameTransport';

export function useGameTransport<TState, TAction>(
  transport: GameTransport<TState, TAction>,
): [TState, (action: TAction) => void] {
  const state = useSyncExternalStore(
    (listener) => transport.subscribe(listener),
    () => transport.getState(),
  );

  return [state, (action: TAction) => transport.dispatch(action)];
}
