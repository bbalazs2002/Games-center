import { ArraySchema, defineTypes, Schema } from '@colyseus/schema';
import { PendingJoinRequest } from '../../../core/PendingJoinRequestSchema';

/**
 * Wire-protocol shape for Hotel's per-field @colyseus/schema state sync —
 * see docs/hotel-0b-multiplayer-specifikacio.md §6.2. Deliberately mirrors
 * ONLY the mutable parts of HotelState: static config data (hotel prices,
 * nightly-rate tables, board space types/adjacency, special lanes) never
 * changes after room creation and is already available to both sides via
 * the shared hotelConfigs.ts import — re-syncing it over the wire on every
 * change would be pure waste. `hotelStateCodec.ts` reunites the two halves
 * (synced mutable fields + static config lookup) back into a plain
 * HotelState on the client.
 *
 * No initializers on any field (`declare` only) — see OpaqueGameStateSchema's
 * comment for why: a TS class-field initializer shadows the tracked
 * accessor `defineTypes` sets up, silently breaking sync.
 */

export class HotelLotSchema extends Schema {
  declare id: string;
  declare ownerId?: string;
  declare buildingsBuilt: number;
  declare hasGarden: boolean;
  declare bankBuybackPrice?: number;
}
defineTypes(HotelLotSchema, {
  id: 'string',
  ownerId: 'string',
  buildingsBuilt: 'number',
  hasGarden: 'boolean',
  bankBuybackPrice: 'number',
});

export class BoardSpaceSchema extends Schema {
  declare id: string;
  declare staircaseForLotId?: string;
}
defineTypes(BoardSpaceSchema, { id: 'string', staircaseForLotId: 'string' });

export class HotelPlayerSchema extends Schema {
  declare id: string;
  declare name: string;
  declare cash: number;
  declare position: number;
  declare bankrupt: boolean;
}
defineTypes(HotelPlayerSchema, {
  id: 'string',
  name: 'string',
  cash: 'number',
  position: 'number',
  bankrupt: 'boolean',
});

export class ConstructionPlanItemSchema extends Schema {
  declare lotId: string;
  declare buildingCount: number;
  declare buildGarden: boolean;
}
defineTypes(ConstructionPlanItemSchema, { lotId: 'string', buildingCount: 'number', buildGarden: 'boolean' });

export class AuctionSchema extends Schema {
  declare lotId: string;
  declare auctioneerId: string;
  declare highestBid: number;
  declare highestBidderId?: string;
  declare passedPlayerIds: ArraySchema<string>;
}
defineTypes(AuctionSchema, {
  lotId: 'string',
  auctioneerId: 'string',
  highestBid: 'number',
  highestBidderId: 'string',
  passedPlayerIds: ['string'],
});

export class DebtSchema extends Schema {
  declare amount: number;
  declare creditorId?: string;
}
defineTypes(DebtSchema, { amount: 'number', creditorId: 'string' });

export class HotelStateSchema extends Schema {
  declare board: ArraySchema<BoardSpaceSchema>;
  declare lots: ArraySchema<HotelLotSchema>;
  declare players: ArraySchema<HotelPlayerSchema>;
  declare currentPlayerIndex: number;
  declare turnPhase: string;
  declare lastMoveRoll?: number;
  declare lastNightsRoll?: number;
  declare lastBuildingPermitRoll?: string;
  declare constructionLockedThisTurn: boolean;
  declare pendingNightsRollLotId?: string;
  declare pendingConstructionPlan: ArraySchema<ConstructionPlanItemSchema>;
  declare pendingDebt?: DebtSchema;
  declare pendingAuction?: AuctionSchema;
  declare staircasePurchaseRightActive: boolean;
  declare lotsWithStaircasePurchasedThisTurn: ArraySchema<string>;
  declare status: string;
  declare winnerId?: string;
  /** One JSON.stringify(LogEntry) per element — see docs/hotel-0b-multiplayer-specifikacio.md §6.2 for why not a LogEntrySchema class. */
  declare log: ArraySchema<string>;
  // GameRoomState fields — every game's Colyseus state carries these, see src/shared/core/GameRoomState.ts.
  declare ready: boolean;
  declare pendingRequests: ArraySchema<PendingJoinRequest>;
}
defineTypes(HotelStateSchema, {
  board: [BoardSpaceSchema],
  lots: [HotelLotSchema],
  players: [HotelPlayerSchema],
  currentPlayerIndex: 'number',
  turnPhase: 'string',
  lastMoveRoll: 'number',
  lastNightsRoll: 'number',
  lastBuildingPermitRoll: 'string',
  constructionLockedThisTurn: 'boolean',
  pendingNightsRollLotId: 'string',
  pendingConstructionPlan: [ConstructionPlanItemSchema],
  pendingDebt: DebtSchema,
  pendingAuction: AuctionSchema,
  staircasePurchaseRightActive: 'boolean',
  lotsWithStaircasePurchasedThisTurn: ['string'],
  status: 'string',
  winnerId: 'string',
  log: ['string'],
  ready: 'boolean',
  pendingRequests: [PendingJoinRequest],
});
