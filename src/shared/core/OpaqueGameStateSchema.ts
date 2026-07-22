import { ArraySchema, defineTypes, Schema } from '@colyseus/schema';
import { PendingJoinRequest } from './PendingJoinRequestSchema';

/**
 * Wire-protocol shape of the Colyseus GameRoom's opaque JSON state. Both sides
 * (server: state definition; client: explicit rootSchema for decoding) need
 * LITERALLY the same class, otherwise the client-side automatic
 * Reflection-based decoding is unreliable (produced empty/undefined fields
 * during testing — see docs/fazis-0b-multiplayer-specifikacio.md §6.1).
 *
 * This is a deliberate, documented exception to the "shared/ has zero
 * Colyseus dependency" principle: this isn't game logic, it's Colyseus
 * wire-protocol shape, which must be identical on both sides.
 */
export class OpaqueGameStateSchema extends Schema {
  // IMPORTANT: no `= ''`/`= false` initializer! TypeScript class field
  // initializers (`useDefineForClassFields`, default at ES2022+ target) use
  // `Object.defineProperty` to create an OWN instance property, which SHADOWS
  // the tracked accessor `defineTypes` sets up on the prototype — server-side
  // writes would then never register as a "changed" field, and the client
  // would never receive anything. See docs/fazis-0b-multiplayer-specifikacio.md
  // §6.1 — this was the real cause behind "client always sees an empty
  // stateJson", not the defineTypes API itself.
  declare stateJson: string;
  /** True once every player slot has joined — the client shows a "waiting for opponent" screen until then. */
  declare ready: boolean;
  /** Join requests awaiting the room host's Accept/Reject — see docs/fazis-0c-dama-ai-specifikacio.md §3.2. */
  declare pendingRequests: ArraySchema<PendingJoinRequest>;
}
defineTypes(OpaqueGameStateSchema, {
  stateJson: 'string',
  ready: 'boolean',
  pendingRequests: [PendingJoinRequest],
});
