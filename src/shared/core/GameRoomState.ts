import type { ArraySchema } from '@colyseus/schema';
import type { PendingJoinRequest } from './PendingJoinRequestSchema';

/**
 * Fields every game's Colyseus state must carry, regardless of whether it's
 * an OpaqueGameStateSchema (JSON blob) or a real per-field Schema (Hotel-0b
 * onward). Shared between the server (`GameRoom`'s `TColyseusState` bound)
 * and the client (the shared online-room connection hook reads `ready`/
 * `pendingRequests` generically too) — see docs/hotel-0b-multiplayer-specifikacio.md §6.1.
 */
export interface GameRoomState {
  ready: boolean;
  pendingRequests: ArraySchema<PendingJoinRequest>;
}
