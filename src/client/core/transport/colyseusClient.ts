import { Client } from 'colyseus.js';
import { OpaqueGameStateSchema } from '../../../shared/core/OpaqueGameStateSchema';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:2567';

export const colyseusClient = new Client(SERVER_URL);

export { OpaqueGameStateSchema };
