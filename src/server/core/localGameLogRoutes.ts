import { mkdir, appendFile } from 'node:fs/promises';
import { Router, type Request, type Response } from 'express';
import { verifyToken } from '../auth/jwt';
import { GAME_LOG_DIR, gameLogFilePath, isSafeLogId } from './gameLogFile';

/**
 * Best-effort JSONL logging for LOCAL (hot-seat) games — see
 * LoggingGameTransport.ts on the client side, which POSTs one request per
 * dispatched action. Online games already get the same logs/games/ format
 * from GameRoom's own stream logger; this is the local-play equivalent,
 * unconditional (not opt-in) since there's no server-side room to flip a
 * flag on. Requires the same JWT every other API call already carries — this
 * writes to the server's disk, so it stays behind the existing invite-code
 * auth gate, not open to the internet.
 */
export const localGameLogRouter = Router();

interface GameLogRequestBody {
  gameType?: unknown;
  sessionId?: unknown;
  entry?: unknown;
}

localGameLogRouter.post('/', async (req: Request, res: Response) => {
  try {
    verifyToken(req.headers.authorization?.replace(/^Bearer /, ''));
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { gameType, sessionId, entry } = req.body as GameLogRequestBody;
  if (
    typeof gameType !== 'string' ||
    typeof sessionId !== 'string' ||
    !isSafeLogId(gameType) ||
    !isSafeLogId(sessionId) ||
    entry === undefined
  ) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  try {
    await mkdir(GAME_LOG_DIR, { recursive: true });
    await appendFile(gameLogFilePath(gameType, sessionId), `${JSON.stringify(entry)}\n`, 'utf8');
    res.status(204).end();
  } catch (error) {
    console.error('Failed to append game log line:', error);
    res.status(500).json({ error: 'Failed to write log' });
  }
});
