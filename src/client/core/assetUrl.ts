/**
 * Prefixes a `public/`-served path (e.g. "/assets/hotel/box.jpg") with Vite's
 * `base` (`import.meta.env.BASE_URL`, e.g. "/game-center/" in production —
 * see docs/deployment-specifikacio.md §7/§8). Only `import`-ed assets get
 * rewritten by Vite automatically; any path built as a plain string literal
 * at runtime (texture/model/cover-image URLs, all over the Hotel game) does
 * NOT, and resolves against the domain root instead of the Apache subpath —
 * real production bug (2026-07-30): the deployed page loaded, but every
 * image 404'd because the browser requested `/assets/...` instead of
 * `/game-center/assets/...`.
 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
