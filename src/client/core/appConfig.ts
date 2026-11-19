import { DEFAULT_APP_CONFIG, readAppConfig, type AppConfig } from '@shared/core/appConfig';

declare global {
  interface Window {
    /** Injected by the server into index.html — see src/server/core/clientShell.ts. Absent under `npm run dev`. */
    __APP_CONFIG__?: unknown;
  }
}

const injected = typeof window === 'undefined' ? undefined : window.__APP_CONFIG__;

/** Whether the server injected a config (production) or the page runs from the Vite dev server. */
export const HAS_INJECTED_CONFIG = injected !== undefined;

/**
 * Runtime config (sub-path, enabled games). Without an injected one — dev server, Vitest — the
 * defaults reproduce the pre-installer behavior: root path, every game enabled.
 */
export const APP_CONFIG: AppConfig = HAS_INJECTED_CONFIG
  ? readAppConfig(injected)
  : DEFAULT_APP_CONFIG;
