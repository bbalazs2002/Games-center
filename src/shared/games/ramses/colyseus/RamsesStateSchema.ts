import { ArraySchema, defineTypes, Schema } from '@colyseus/schema';
import { PendingJoinRequest } from '../../../core/PendingJoinRequestSchema';

/**
 * Wire-protocol shape for Ramses' per-field @colyseus/schema state sync —
 * see docs/ramses-0b-specifikacio.md §3.3, docs/ramses-0a-specifikacio.md
 * §8.2. Unlike Hotel (open information by design), a still-covered cell's
 * `treasureId` must never be present here — the server-side codec
 * (`ramsesStateCodec.ts`) only ever writes a MASKED copy of the true state
 * into this schema (via `toPublicRamsesState`), never the raw engine state.
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

export class TreasureCardSchema extends Schema {
  declare id: string;
  declare treasureId: string;
  declare points: number;
}
defineTypes(TreasureCardSchema, { id: 'string', treasureId: 'string', points: 'number' });

export class RamsesPlayerSchema extends Schema {
  declare id: string;
  declare name: string;
  declare wonCards: ArraySchema<TreasureCardSchema>;
}
defineTypes(RamsesPlayerSchema, { id: 'string', name: 'string', wonCards: [TreasureCardSchema] });

/**
 * Flattened "tagged union" — @colyseus/schema has no native union type, so
 * every variant's fields live side by side here, only the ones matching
 * `type` are ever meaningfully set (see ramsesStateCodec.ts's sync/decode,
 * and state.ts's PendingSpecialEffect for the real, precise union). Absent
 * entirely (schema field left undefined) when `RamsesState.pendingSpecialEffect`
 * is null.
 */
export class PendingSpecialEffectSchema extends Schema {
  declare type: string; // 'GIFT' | 'RISK' | 'POKER' | 'FATA_MORGANA'
  declare drawerId: string;
  // GIFT
  declare holderId?: string;
  declare targetTreasureId?: string;
  // RISK
  declare riskTreasureId1?: string;
  declare riskTreasureId2?: string;
  declare firstFound?: boolean;
  // POKER
  declare searcherId?: string;
  declare pokerTreasureId?: string;
  // FATA_MORGANA
  declare neighborId?: string;
  declare cardId?: string;
  declare cardTreasureId?: string;
  declare cardPoints?: number;
}
defineTypes(PendingSpecialEffectSchema, {
  type: 'string',
  drawerId: 'string',
  holderId: 'string',
  targetTreasureId: 'string',
  riskTreasureId1: 'string',
  riskTreasureId2: 'string',
  firstFound: 'boolean',
  searcherId: 'string',
  pokerTreasureId: 'string',
  neighborId: 'string',
  cardId: 'string',
  cardTreasureId: 'string',
  cardPoints: 'number',
});

export class RamsesStateSchema extends Schema {
  declare board: ArraySchema<RamsesCellSchema>;
  declare emptyCellId: string;
  declare activeCard?: TreasureCardSchema;
  declare turnPhase: string;
  declare pendingSpecialEffect?: PendingSpecialEffectSchema;
  declare treasureLayerRotated: boolean;
  /** Count only — the pile's actual contents/order never go over the wire, see docs/ramses-0b-specifikacio.md §3.1/3.3. */
  declare drawPileCount: number;
  declare players: ArraySchema<RamsesPlayerSchema>;
  declare currentPlayerIndex: number;
  declare status: string;
  declare winnerIds: ArraySchema<string>;
  /** JSON-stringified RamsesLogEntry, one per element — same string-array encoding as Hotel's own `log` field (HotelStateSchema.ts), sidestepping the need for a dedicated schema class for a purely diagnostic (see docs/shell-ux-specifikacio.md §4.2.1), never-rendered-in-UI field. */
  declare log: ArraySchema<string>;
  // GameRoomState fields — every game's Colyseus state carries these, see src/shared/core/GameRoomState.ts.
  declare ready: boolean;
  declare pendingRequests: ArraySchema<PendingJoinRequest>;
}
defineTypes(RamsesStateSchema, {
  board: [RamsesCellSchema],
  emptyCellId: 'string',
  activeCard: TreasureCardSchema,
  turnPhase: 'string',
  pendingSpecialEffect: PendingSpecialEffectSchema,
  treasureLayerRotated: 'boolean',
  drawPileCount: 'number',
  players: [RamsesPlayerSchema],
  currentPlayerIndex: 'number',
  status: 'string',
  winnerIds: ['string'],
  log: ['string'],
  ready: 'boolean',
  pendingRequests: [PendingJoinRequest],
});
