import { Client } from 'colyseus.js';
import { SERVER_URL } from '../serverUrl';
import { OpaqueGameStateSchema } from '@shared/core/OpaqueGameStateSchema';

export const colyseusClient = new Client(SERVER_URL);

export { OpaqueGameStateSchema };
