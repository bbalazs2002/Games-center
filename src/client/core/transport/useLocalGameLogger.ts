import { useMemo } from 'react';
import { useAuth } from '../../shell/auth/AuthContext';
import type { GameTransport } from './GameTransport';
import { LoggingGameTransport } from './LoggingGameTransport';

/**
 * Wraps a hot-seat game's own `LocalGameTransport` (already `useMemo`'d by
 * the caller with a stable dependency list) so every action gets mirrored to
 * the server as a game-log line — see LoggingGameTransport.ts. Memoized on
 * `transport` itself, so this doesn't restart the log session (new
 * sessionId/seq counter) on every render, only when the underlying
 * transport instance actually changes.
 */
export function useLocalGameLogger<TState, TAction>(
  transport: GameTransport<TState, TAction>,
  gameType: string,
): GameTransport<TState, TAction> {
  const { auth } = useAuth();
  return useMemo(
    () => new LoggingGameTransport(transport, gameType, auth?.token ?? null),
    [transport, gameType, auth?.token],
  );
}
