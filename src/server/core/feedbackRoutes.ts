import { Router, type Request, type Response } from 'express';
import { verifyToken } from '../auth/jwt';
import { prisma } from '../db/prismaClient';

/**
 * Bug/suggestion reports — see docs/shell-ux-specifikacio.md §4.3. Auth is
 * OPTIONAL here, deliberately DIFFERENT from localGameLogRoutes.ts's strict
 * `verifyToken`-or-401 gate: `/games/:gameId/local` isn't behind
 * RequireAuth, so a hot-seat player reporting a real bug may have no JWT at
 * all — a debug log silently no-op'ing in that case is fine (fire-and-forget,
 * purely diagnostic infra), but silently dropping an actual user report
 * isn't. `userId` is attached only when a token happens to be present AND
 * valid; anything else still gets recorded.
 */
export const feedbackRouter = Router();

interface FeedbackRequestBody {
  type?: unknown;
  message?: unknown;
  gameType?: unknown;
  context?: unknown;
}

function tryGetUserId(authHeader: string | undefined): string | null {
  try {
    return verifyToken(authHeader?.replace(/^Bearer /, '')).userId;
  } catch {
    return null;
  }
}

feedbackRouter.post('/', async (req: Request, res: Response) => {
  const { type, message, gameType, context } = req.body as FeedbackRequestBody;
  if ((type !== 'BUG' && type !== 'SUGGESTION') || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  try {
    await prisma.feedbackReport.create({
      data: {
        type,
        message: message.trim(),
        gameType: typeof gameType === 'string' ? gameType : null,
        contextJson: context && typeof context === 'object' ? context : undefined,
        userId: tryGetUserId(req.headers.authorization),
        userAgent: req.headers['user-agent'] ?? null,
      },
    });
    res.status(204).end();
  } catch (error) {
    console.error('Failed to store feedback report:', error);
    res.status(500).json({ error: 'Failed to store feedback' });
  }
});
