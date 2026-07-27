import 'dotenv/config';
import http from 'node:http';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { LobbyRoom, Server as ColyseusServer } from 'colyseus';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { authRouter } from './auth/authRoutes';
import { DamaRoom } from './games/dama/DamaRoom';
import { HotelRoom } from './games/hotel/HotelRoom';
import { RamsesRoom } from './games/ramses/RamsesRoom';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);

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
gameServer.define('dama', DamaRoom).enableRealtimeListing();
gameServer.define('hotel', HotelRoom).enableRealtimeListing();
gameServer.define('ramses', RamsesRoom).enableRealtimeListing();

const port = Number(process.env.PORT ?? 2567);

gameServer.listen(port).then(() => {
  console.log(`Games Center szerver fut: http://localhost:${port}`);
});
