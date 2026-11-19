import { APP_CONFIG } from './appConfig';

/**
 * Prefixes a `public/`-served path (e.g. "/assets/hotel/box.jpg") with the
 * runtime sub-path (`APP_CONFIG.basePath`, e.g. "/game-center/" in production
 * — injected by the server, see docs/installer-kompatibilitas-specifikacio.md
 * §3.1). Only `import`-ed assets get rewritten by the bundler automatically;
 * any path built as a plain string literal at runtime (texture/model/
 * cover-image URLs, all over the Hotel game) does NOT, and would resolve
 * against the domain root instead of the Apache subpath — real production bug
 * (2026-07-30): the deployed page loaded, but every image 404'd because the
 * browser requested `/assets/...` instead of `/game-center/assets/...`.
 */
export function assetUrl(path: string): string {
  return `${APP_CONFIG.basePath}${path.replace(/^\//, '')}`;
}
