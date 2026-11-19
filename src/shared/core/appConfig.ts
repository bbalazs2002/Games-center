/**
 * Runtime configuration that the server injects into `index.html` (see
 * docs/installer-kompatibilitas-specifikacio.md §3.1). It replaces the
 * build-time `VITE_BASE_PATH`/`VITE_ENABLED_GAMES`, so ONE image can be
 * installed under any sub-path with any set of enabled games.
 */
export interface AppConfig {
  /** Always starts and ends with "/" — "/" for a root deploy, e.g. "/game-center/" under a sub-path. */
  basePath: string;
  /** `null` means every game is enabled (the local dev/CI default). */
  enabledGames: string[] | null;
}

export const DEFAULT_APP_CONFIG: AppConfig = { basePath: '/', enabledGames: null };

// Same pattern as the installer's `BASE_PATH` validation in deploy.json. Being this strict is also
// what makes it safe to place the value into the injected `<base href="...">` attribute.
const BASE_PATH_PATTERN = /^\/([a-z0-9._~-]+\/)*$/;

/** Validates the `BASE_PATH` env value; unset/empty means a root deploy. Throws on a malformed value. */
export function parseBasePath(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return '/';
  if (!BASE_PATH_PATTERN.test(value)) {
    throw new Error(
      `Érvénytelen BASE_PATH: "${value}" (perjellel kezdődjön és végződjön, pl. /game-center/).`,
    );
  }
  return value;
}

/** Parses the comma-separated `ENABLED_GAMES` value; unset/blank means "all games" (`null`). */
export function parseEnabledGames(raw: string | undefined): string[] | null {
  const ids = (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : null;
}

export function isGameEnabled(enabledGames: readonly string[] | null, id: string): boolean {
  return enabledGames === null || enabledGames.includes(id);
}

/**
 * Defensive read of whatever the page carries in `window.__APP_CONFIG__`: anything malformed falls
 * back to the defaults instead of breaking the whole client.
 */
export function readAppConfig(raw: unknown): AppConfig {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_APP_CONFIG;
  const { basePath, enabledGames } = raw as Record<string, unknown>;
  const safeBasePath =
    typeof basePath === 'string' && BASE_PATH_PATTERN.test(basePath) ? basePath : '/';
  const safeEnabled =
    Array.isArray(enabledGames) && enabledGames.every((id) => typeof id === 'string')
      ? (enabledGames as string[])
      : null;
  return { basePath: safeBasePath, enabledGames: safeEnabled };
}

/** API/WebSocket base URL for an injected config: the page's origin plus the sub-path, without a trailing slash. */
export function deriveServerUrl(config: AppConfig, origin: string): string {
  return `${origin}${config.basePath.replace(/\/$/, '')}`;
}
