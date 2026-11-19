import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { createHealthRouter, resolveAppVersion } from './healthRoutes';

let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

describe('GET /api/health', () => {
  it('answers 200 with status and version, without any authentication', async () => {
    const app = express();
    app.use('/api/health', createHealthRouter('1.2.3'));
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const { port } = server!.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/api/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', version: '1.2.3' });
  });
});

describe('resolveAppVersion', () => {
  it('prefers APP_VERSION', () => {
    expect(resolveAppVersion({ APP_VERSION: '2.0.0' }, () => '{"version":"0.0.1"}')).toBe('2.0.0');
  });

  it('falls back to package.json', () => {
    expect(resolveAppVersion({}, () => '{"version":"0.0.1"}')).toBe('0.0.1');
  });

  it('never throws — "unknown" when nothing is readable', () => {
    expect(
      resolveAppVersion({}, () => {
        throw new Error('no file');
      }),
    ).toBe('unknown');
  });
});
