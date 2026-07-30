/**
 * Default (dev-only — production always sets `VITE_SERVER_URL` explicitly at
 * build time, see docs/deployment-specifikacio.md §7) API/WS base URL.
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
