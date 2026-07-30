import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
    define: {
      // Bridges the plain (non-VITE_-prefixed) `ENABLED_GAMES` build-time env
      // var into the client bundle — deliberately a single source of truth
      // (see docs/deployment-specifikacio.md §4) shared with the server,
      // which reads `process.env.ENABLED_GAMES` directly without a prefix.
      'import.meta.env.VITE_ENABLED_GAMES': JSON.stringify(env.ENABLED_GAMES ?? ''),
    },
  };
});
