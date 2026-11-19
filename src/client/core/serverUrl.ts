import { deriveServerUrl } from '@shared/core/appConfig';
import { APP_CONFIG, HAS_INJECTED_CONFIG } from './appConfig';

/**
 * Default (dev-only — production gets its URL from the server-injected
 * runtime config, see `SERVER_URL` below) API/WS base URL.
 * Deliberately derived from `window.location.hostname`, NOT hardcoded to
 * `localhost` — opening the dev server via `npm run dev -- --host` from
 * another device on the LAN loads the page fine (Vite serves it on that
 * device's own network), but a hardcoded `localhost` fallback would then
 * point every API/WS call back at THAT OTHER DEVICE's own loopback address
 * instead of the dev machine, which is never listening there — real
 * playtest report (2026-07-30). `window.location.hostname` always reflects
 * whatever host the page was actually reached through (a LAN IP, "localhost",
 * or a real domain alike), so this fallback is correct in every case.
 */
export const DEFAULT_SERVER_URL = `http://${window.location.hostname}:2567`;

/**
 * The API/WS base URL every client module uses. Precedence: the page's own
 * origin plus the server-injected sub-path (production — no build-time URL
 * needed, see docs/installer-kompatibilitas-specifikacio.md §3.1) → an
 * explicit `VITE_SERVER_URL` (dev-only override, e.g. a server on another
 * machine) → `DEFAULT_SERVER_URL` (plain `npm run dev`). The injected config
 * deliberately wins: a stray `VITE_SERVER_URL` from a developer's `.env` that
 * got baked into a local build must never override the real deployment URL.
 */
export const SERVER_URL: string = HAS_INJECTED_CONFIG
  ? deriveServerUrl(APP_CONFIG, window.location.origin)
  : import.meta.env.VITE_SERVER_URL || DEFAULT_SERVER_URL;
