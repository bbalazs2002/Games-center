import { defineTypes, Schema } from '@colyseus/schema';

/**
 * Wire-protocol shape for a join request awaiting the room host's Accept/Reject
 * decision — see docs/fazis-0c-dama-ai-specifikacio.md §3.2. Lives in shared/
 * (not server/core), same reasoning as OpaqueGameStateSchema: the client needs
 * literally the same class for reliable rootSchema decoding.
 */
export class PendingJoinRequest extends Schema {
  declare sessionId: string;
  declare userId: string;
  declare displayName: string;
}
defineTypes(PendingJoinRequest, { sessionId: 'string', userId: 'string', displayName: 'string' });
