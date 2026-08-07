import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Production deploys serve the app under a subpath (e.g. domain.hu/game-center/,
// see docs/deployment-specifikacio.md §8) — `base` makes every built asset URL
// and (via the auto-derived `import.meta.env.BASE_URL`) the router's own
// basename subpath-aware. Local dev/CI never set VITE_BASE_PATH, so `base`
// stays '/' and nothing here changes their behavior.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || '/',
    // Mirrors the tsconfig.json/tsconfig.server.json `paths` — Vite doesn't
    // read tsconfig `paths` itself, so the mapping is duplicated here. Also
    // picked up by Vitest (no separate vitest.config.ts, so it inherits this
    // file's `resolve`), which is why @server is defined even though the
    // client bundle itself never reaches into it.
    resolve: {
      alias: {
        '@client': path.resolve(rootDir, 'src/client'),
        '@server': path.resolve(rootDir, 'src/server'),
        '@shared': path.resolve(rootDir, 'src/shared'),
      },
    },
    define: {
      // Bridges the plain (non-VITE_-prefixed) `ENABLED_GAMES` build-time env
      // var into the client bundle — deliberately a single source of truth
      // (see docs/deployment-specifikacio.md §4) shared with the server,
      // which reads `process.env.ENABLED_GAMES` directly without a prefix.
      'import.meta.env.VITE_ENABLED_GAMES': JSON.stringify(env.ENABLED_GAMES ?? ''),
    },
  };
});
