import { Client } from 'colyseus.js';
import { DEFAULT_SERVER_URL } from '../serverUrl';
import { OpaqueGameStateSchema } from '../../../shared/core/OpaqueGameStateSchema';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL;

export const colyseusClient = new Client(SERVER_URL);

export { OpaqueGameStateSchema };
