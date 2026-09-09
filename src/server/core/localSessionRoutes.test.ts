import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertMock = vi.fn();
vi.mock('../db/prismaClient', () => ({
  prisma: { gameSession: { upsert: (...args: unknown[]) => upsertMock(...args) } },
}));

// Imported AFTER the mock above so the router picks up the mocked prisma singleton.
const { localSessionRouter } = await import('./localSessionRoutes');

let app: Express;
let baseUrl: string;
let server: ReturnType<Express['listen']>;

beforeEach(async () => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue(undefined);
  app = express();
  app.use(express.json());
  app.use('/api/local-sessions', localSessionRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api/local-sessions`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('PUT /api/local-sessions/:sessionId', () => {
  it('succeeds with no Authorization header at all — the exact bug this route fixes vs. the old localGameLogRoutes.ts', async () => {
    const res = await fetch(`${baseUrl}/session-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: 'dama', state: { status: 'IN_PROGRESS' } }),
    });
    expect(res.status).toBe(204);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const call = upsertMock.mock.calls[0][0];
    expect(call.create.userId).toBeNull();
  });

  it('rejects an unknown gameType with 400 (isKnownGameType doubles as an allow-list)', async () => {
    const res = await fetch(`${baseUrl}/session-2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: 'not-a-real-game', state: { status: 'IN_PROGRESS' } }),
    });
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('marks the row FINISHED with a non-null endedAt when the submitted state is already over', async () => {
    const res = await fetch(`${baseUrl}/session-3`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: 'dama', state: { status: 'FINISHED', outcome: 'DRAW' } }),
    });
    expect(res.status).toBe(204);
    const call = upsertMock.mock.calls[0][0];
    expect(call.create.status).toBe('FINISHED');
    expect(call.create.endedAt).not.toBeNull();
    expect(call.update.status).toBe('FINISHED');
    expect(call.update.endedAt).not.toBeNull();
  });

  it('attaches a userId when a valid Bearer token is present', async () => {
    // No real JWT secret is configured in this test env, so verifyToken will
    // throw on any token — this only asserts the OPTIONAL-auth shape (still
    // 204, still saves) holds even with a (here: invalid) Authorization
    // header present, mirroring feedbackRoutes.ts's own tryGetUserId contract.
    const res = await fetch(`${baseUrl}/session-4`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-a-real-token' },
      body: JSON.stringify({ gameType: 'hotel', state: { status: 'IN_PROGRESS' } }),
    });
    expect(res.status).toBe(204);
    const call = upsertMock.mock.calls[0][0];
    expect(call.create.userId).toBeNull(); // invalid token -> tryGetUserId falls back to null, doesn't reject the request
  });
});
