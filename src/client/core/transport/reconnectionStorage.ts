const STORAGE_PREFIX = 'games-center:reconnect:';

/**
 * Persists a Colyseus `room.reconnectionToken` (already in the SDK's
 * `roomId:token` combined format) across page reloads, so an unexpected
 * disconnect (WiFi drop, phone lock, accidental tab close) doesn't kick a
 * player out of their game — see docs/fazis-0b-multiplayer-specifikacio.md §16.
 * Keyed by game type since a browser could have games for different games
 * saved at once.
 */
export function saveReconnectionToken(gameType: string, token: string): void {
  localStorage.setItem(STORAGE_PREFIX + gameType, token);
}

export function loadReconnectionToken(gameType: string): string | null {
  return localStorage.getItem(STORAGE_PREFIX + gameType);
}

export function clearReconnectionToken(gameType: string): void {
  localStorage.removeItem(STORAGE_PREFIX + gameType);
}
