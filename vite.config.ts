import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Production serves the app under a runtime-configured sub-path (e.g. domain.hu/game-center/,
// see docs/installer-kompatibilitas-specifikacio.md §3.1), so the build must not know it: a
// RELATIVE `base` makes every built asset URL resolve against the `<base href>` the server
// injects into index.html (deep links included). The dev server keeps '/', so local dev and
// Vitest behave exactly as before.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? './' : '/',
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
}));
