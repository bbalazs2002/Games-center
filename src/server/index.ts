import 'dotenv/config';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { LobbyRoom, Server as ColyseusServer } from 'colyseus';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { authRouter } from './auth/authRoutes';
import { feedbackRouter } from './core/feedbackRoutes';
import { localGameLogRouter } from './core/localGameLogRoutes';
import { DamaRoom } from './games/dama/DamaRoom';
import { GazdalkodjOkosanRoom } from './games/gazdalkodjOkosan/GazdalkodjOkosanRoom';
import { GwentRoom } from './games/gwent/GwentRoom';
import { HotelRoom } from './games/hotel/HotelRoom';
import { RamsesRoom } from './games/ramses/RamsesRoom';

/**
 * Same single source of truth as the client's `gamesRegistry.ts` filter (see
 * docs/deployment-specifikacio.md §4) — unset/empty means every game stays
 * registered, so local dev/CI behavior never changes. Filtering HERE (not
 * just hiding the menu entry client-side) means a disabled game's Colyseus
 * room genuinely can't be joined/created — no room handler is registered for
 * it at all, not just hard to find.
 */
const enabledGames = process.env.ENABLED_GAMES?.split(',')
  .map((id) => id.trim())
  .filter(Boolean);
function isGameEnabled(id: string): boolean {
  return !enabledGames || enabledGames.includes(id);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/game-log', localGameLogRouter);
app.use('/api/feedback', feedbackRouter);

/**
 * Serves the built client (see docs/deployment-specifikacio.md §5) — a
 * no-op under local dev/CI, where `dist/` is never built and the Vite dev
 * server handles the client on its own port instead. The SPA fallback uses
 * a RegExp (not a bare `'*'` string) so it unambiguously excludes `/api/*`
 * regardless of the installed Express/path-to-regexp version's wildcard
 * quirks — any other GET resolves to `index.html`, letting React Router
 * handle the actual path client-side.
 */
const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const distIndexHtml = path.join(distDir, 'index.html');
if (existsSync(distIndexHtml)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(distIndexHtml);
  });
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Szerverhiba történt.' });
});

const httpServer = http.createServer(app);

const gameServer = new ColyseusServer({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('lobby', LobbyRoom);
// enableRealtimeListing() is what makes the LobbyRoom actually push '+'/'-'
// updates to connected clients on room create/join/leave/lock/dispose —
// without it, LobbyPage only ever sees the one-time snapshot from the moment
// it joined the lobby room, never anything that happens afterwards.
if (isGameEnabled('dama')) gameServer.define('dama', DamaRoom).enableRealtimeListing();
if (isGameEnabled('hotel')) gameServer.define('hotel', HotelRoom).enableRealtimeListing();
if (isGameEnabled('ramses')) gameServer.define('ramses', RamsesRoom).enableRealtimeListing();
if (isGameEnabled('gwent')) gameServer.define('gwent', GwentRoom).enableRealtimeListing();
if (isGameEnabled('gazdalkodj-okosan')) gameServer.define('gazdalkodj-okosan', GazdalkodjOkosanRoom).enableRealtimeListing();

const port = Number(process.env.PORT ?? 2567);

gameServer.listen(port).then(() => {
  console.log(`Games Center szerver fut: http://localhost:${port}`);
});
