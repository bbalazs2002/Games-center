import { ArraySchema, defineTypes, Schema } from '@colyseus/schema';
import { PendingJoinRequest } from '../../../core/PendingJoinRequestSchema';

/**
 * Wire-protocol shape for Ramses' per-field @colyseus/schema state sync —
 * see docs/ramses-0b-specifikacio.md §3.3. Unlike Hotel (open information by
 * design), a still-covered cell's `treasureId` must never be present here —
 * the server-side codec (`ramsesStateCodec.ts`) only ever writes a MASKED
 * copy of the true state into this schema (via `toPublicRamsesState`), never
 * the raw engine state.
 *
 * No initializers on any field (`declare` only) — a TS class-field
 * initializer would shadow the tracked accessor `defineTypes` sets up,
 * silently breaking sync (see OpaqueGameStateSchema's comment).
 */

export class RamsesCellSchema extends Schema {
  declare id: string;
  declare row: number;
  declare col: number;
  /** Absent (not `null`) when still covered by a pyramid — @colyseus/schema has no native null, and this IS the masking (see toPublicRamsesState). */
  declare treasureId?: string;
  declare hasPyramid: boolean;
}
defineTypes(RamsesCellSchema, { id: 'string', row: 'number', col: 'number', treasureId: 'string', hasPyramid: 'boolean' });

export class SearchCardSchema extends Schema {
  declare id: string;
  declare treasureId: string;
  declare points: number;
}
defineTypes(SearchCardSchema, { id: 'string', treasureId: 'string', points: 'number' });

export class RamsesPlayerSchema extends Schema {
  declare id: string;
  declare name: string;
  declare wonCards: ArraySchema<SearchCardSchema>;
}
defineTypes(RamsesPlayerSchema, { id: 'string', name: 'string', wonCards: [SearchCardSchema] });

export class RamsesStateSchema extends Schema {
  declare board: ArraySchema<RamsesCellSchema>;
  declare emptyCellId: string;
  declare activeCard?: SearchCardSchema;
  /** Count only — the pile's actual contents/order never go over the wire, see docs/ramses-0b-specifikacio.md §3.1/3.3. */
  declare drawPileCount: number;
  declare players: ArraySchema<RamsesPlayerSchema>;
  declare currentPlayerIndex: number;
  declare status: string;
  declare winnerIds: ArraySchema<string>;
  // GameRoomState fields — every game's Colyseus state carries these, see src/shared/core/GameRoomState.ts.
  declare ready: boolean;
  declare pendingRequests: ArraySchema<PendingJoinRequest>;
}
defineTypes(RamsesStateSchema, {
  board: [RamsesCellSchema],
  emptyCellId: 'string',
  activeCard: SearchCardSchema,
  drawPileCount: 'number',
  players: [RamsesPlayerSchema],
  currentPlayerIndex: 'number',
  status: 'string',
  winnerIds: ['string'],
  ready: 'boolean',
  pendingRequests: [PendingJoinRequest],
});
