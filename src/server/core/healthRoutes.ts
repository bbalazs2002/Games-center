import { readFileSync } from 'node:fs';
import { Router } from 'express';

/**
 * The installer's post-start check (docs/installer-kompatibilitas-specifikacio.md §3.1) polls this
 * without authentication and compares `version` with the release it just started, so it exposes
 * nothing else. Kept under `/api` so the SPA fallback (which serves every other GET) never shadows it.
 */
export function createHealthRouter(version: string): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ status: 'ok', version });
  });
  return router;
}

/** `APP_VERSION` is baked into the image by the release build; outside an image, fall back to package.json. */
export function resolveAppVersion(
  env: Record<string, string | undefined> = process.env,
  readPackageJson: () => string = () =>
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
): string {
  const fromEnv = env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv;
  try {
    const parsed = JSON.parse(readPackageJson()) as { version?: unknown };
    if (typeof parsed.version === 'string') return parsed.version;
  } catch {
    // Falls through to "unknown" — a missing version must not stop the server from starting.
  }
  return 'unknown';
}
