import { join } from 'node:path';

/** Shared by GameRoom's own (online-only) stream logger and localGameLogRoutes' per-request appends — one convention, one place. */
export const GAME_LOG_DIR = join(process.cwd(), 'logs', 'games');

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/** Both `gameType` and `sessionId` end up directly in a filename — reject anything that isn't a plain identifier before it ever reaches a path, so untrusted client input (localGameLogRoutes) can never traverse outside GAME_LOG_DIR. */
export function isSafeLogId(id: string): boolean {
  return SAFE_ID_PATTERN.test(id);
}

export function gameLogFilePath(gameType: string, sessionId: string): string {
  return join(GAME_LOG_DIR, `${gameType}-${sessionId}.jsonl`);
}
