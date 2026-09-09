import { Router, type Request, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { verifyToken } from '../auth/jwt';
import { prisma } from '../db/prismaClient';
import { isFinished, isKnownGameType, type HasGameStatus } from '@shared/core/gameCompletion';
import { GAME_SESSION_MODE, GAME_SESSION_STATUS } from './gameSessionStatus';

/**
 * Best-effort persistence for LOCAL (hot-seat) games — the local-play
 * equivalent of GameRoom's own periodic flushToDatabase()/markSessionFinished(),
 * writing into the exact same `game_sessions` table (see
 * src/server/core/GameRoom.ts) instead of a separate mechanism, so both
 * modes are queryable the same way. Replaces the old, broken
 * localGameLogRoutes.ts (per-action JSONL-to-file, unconditionally
 * required a JWT even though hot-seat play is deliberately NOT behind
 * RequireAuth — see src/client/shell/routes.tsx's `/games/:gameId/local`
 * route — so every anonymous hot-seat player's log silently 401'd forever).
 *
 * Auth is OPTIONAL here, same `tryGetUserId`-or-null precedent already
 * established in feedbackRoutes.ts: a hot-seat player may genuinely have no
 * JWT at all, and this is fire-and-forget diagnostic/persistence infra, not
 * a user-facing action that must be attributed to succeed.
 */
export const localSessionRouter = Router();

interface LocalSessionRequestBody {
  gameType?: unknown;
  state?: unknown;
}

function tryGetUserId(authHeader: string | undefined): string | null {
  try {
    return verifyToken(authHeader?.replace(/^Bearer /, '')).userId;
  } catch {
    return null;
  }
}

/** Untrusted client JSON — only checks the one field isFinished() actually reads, same minimal-trust shape as gameCompletion.ts's own HasGameStatus. */
function hasGameStatus(state: object): state is HasGameStatus {
  const status: unknown = (state as { status?: unknown }).status;
  return status === 'IN_PROGRESS' || status === 'FINISHED';
}

localSessionRouter.put('/:sessionId', async (req: Request, res: Response) => {
  const { gameType, state } = req.body as LocalSessionRequestBody;
  if (
    typeof gameType !== 'string' ||
    !isKnownGameType(gameType) ||
    state === undefined ||
    typeof state !== 'object' ||
    state === null ||
    !hasGameStatus(state)
  ) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  const finished = isFinished(state);
  const userId = tryGetUserId(req.headers.authorization);
  const stateJson = state as Prisma.InputJsonValue;

  try {
    await prisma.gameSession.upsert({
      where: { id: req.params.sessionId },
      create: {
        id: req.params.sessionId,
        gameType,
        mode: GAME_SESSION_MODE.LOCAL,
        status: finished ? GAME_SESSION_STATUS.FINISHED : GAME_SESSION_STATUS.IN_PROGRESS,
        stateJson,
        userId,
        endedAt: finished ? new Date() : null,
      },
      update: {
        status: finished ? GAME_SESSION_STATUS.FINISHED : GAME_SESSION_STATUS.IN_PROGRESS,
        stateJson,
        endedAt: finished ? new Date() : null,
      },
    });
    res.status(204).end();
  } catch (error) {
    console.error('Failed to save local game session:', error);
    res.status(500).json({ error: 'Failed to save session' });
  }
});
