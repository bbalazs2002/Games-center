import { ArraySchema } from '@colyseus/schema';
import { replaceStringArray } from '../../../core/colyseusSyncHelpers';
import { BOARD_SPACES, HOTEL_CONFIGS, SPECIAL_LANES } from '../engine/hotelConfigs';
import type {
  BoardSpace,
  BuildingPermitResult,
  ConstructionPlanItem,
  HotelLot,
  HotelState,
  HotelStatus,
  LogEntry,
  PendingAuction,
  PendingDebt,
  Player,
  TurnPhase,
} from '../engine/state';
import {
  AuctionSchema,
  BoardSpaceSchema,
  ConstructionPlanItemSchema,
  DebtSchema,
  HotelLotSchema,
  HotelPlayerSchema,
  HotelStateSchema,
} from './HotelStateSchema';

function syncLotFields(schema: HotelLotSchema, lot: HotelLot): void {
  schema.ownerId = lot.ownerId ?? undefined;
  schema.buildingsBuilt = lot.buildingsBuilt;
  schema.hasGarden = lot.hasGarden;
  schema.bankBuybackPrice = lot.bankBuybackPrice ?? undefined;
}

/**
 * Includes `name`, unlike the other per-entity sync functions that leave
 * their id-like fields alone after creation — a Hotel player's name genuinely
 * changes once, placeholder -> real, via GameRoom.onPlayerAdmitted (creation
 * happens before anyone has joined, see HotelRoom.createInitialState), so it
 * has to be re-syncable, not just set-once like BoardSpace/HotelLot's `id`.
 */
function syncPlayerFields(schema: HotelPlayerSchema, player: Player): void {
  schema.name = player.name;
  schema.cash = player.cash;
  schema.position = player.position;
  schema.bankrupt = player.bankrupt;
}

/** First call creates the (fixed-length, never reordered) schema elements; every later call mutates the existing instances' own fields, which is what makes the diffing efficient. */
function syncBoard(schema: HotelStateSchema, board: BoardSpace[]): void {
  if (!schema.board) {
    schema.board = new ArraySchema(
      ...board.map((space) => {
        const spaceSchema = new BoardSpaceSchema();
        spaceSchema.id = space.id;
        spaceSchema.staircaseForLotId = space.staircaseForLotId ?? undefined;
        return spaceSchema;
      }),
    );
    return;
  }
  board.forEach((space, i) => {
    schema.board[i].staircaseForLotId = space.staircaseForLotId ?? undefined;
  });
}

function syncLots(schema: HotelStateSchema, lots: HotelLot[]): void {
  if (!schema.lots) {
    schema.lots = new ArraySchema(
      ...lots.map((lot) => {
        const lotSchema = new HotelLotSchema();
        lotSchema.id = lot.id;
        syncLotFields(lotSchema, lot);
        return lotSchema;
      }),
    );
    return;
  }
  lots.forEach((lot, i) => syncLotFields(schema.lots[i], lot));
}

function syncPlayers(schema: HotelStateSchema, players: Player[]): void {
  if (!schema.players) {
    schema.players = new ArraySchema(
      ...players.map((player) => {
        const playerSchema = new HotelPlayerSchema();
        playerSchema.id = player.id;
        syncPlayerFields(playerSchema, player);
        return playerSchema;
      }),
    );
    return;
  }
  players.forEach((player, i) => syncPlayerFields(schema.players[i], player));
}

/** Small and changes rarely (only during AWAITING_BUILDING_PERMIT) — clear+rebuild every sync, no need for push-only diffing here. */
function syncConstructionPlan(schema: HotelStateSchema, plan: ConstructionPlanItem[] | null): void {
  if (!schema.pendingConstructionPlan) schema.pendingConstructionPlan = new ArraySchema<ConstructionPlanItemSchema>();
  schema.pendingConstructionPlan.splice(0, schema.pendingConstructionPlan.length);
  for (const item of plan ?? []) {
    const itemSchema = new ConstructionPlanItemSchema();
    itemSchema.lotId = item.lotId;
    itemSchema.buildingCount = item.buildingCount;
    itemSchema.buildGarden = Boolean(item.buildGarden);
    schema.pendingConstructionPlan.push(itemSchema);
  }
}

function syncDebt(schema: HotelStateSchema, debt: PendingDebt | null): void {
  if (!debt) {
    schema.pendingDebt = undefined;
    return;
  }
  if (!schema.pendingDebt) schema.pendingDebt = new DebtSchema();
  schema.pendingDebt.amount = debt.amount;
  schema.pendingDebt.creditorId = debt.creditorId ?? undefined;
}

/** Mutates the existing AuctionSchema instance's fields when one is already live (so a bid war only ever diffs highestBid/highestBidderId, not the whole object). */
function syncAuction(schema: HotelStateSchema, auction: PendingAuction | null): void {
  if (!auction) {
    schema.pendingAuction = undefined;
    return;
  }
  if (!schema.pendingAuction) {
    schema.pendingAuction = new AuctionSchema();
    schema.pendingAuction.passedPlayerIds = new ArraySchema<string>();
  }
  schema.pendingAuction.lotId = auction.lotId;
  schema.pendingAuction.auctioneerId = auction.auctioneerId;
  schema.pendingAuction.highestBid = auction.highestBid;
  schema.pendingAuction.highestBidderId = auction.highestBidderId ?? undefined;
  replaceStringArray(schema.pendingAuction.passedPlayerIds, auction.passedPlayerIds);
  schema.pendingAuction.currentBidderId = auction.currentBidderId;
}

/** Push-only — never cleared, so only newly-added entries are ever sent over the wire. This is the actual fix for the unbounded-log-resend problem. */
function syncLog(schema: HotelStateSchema, log: LogEntry[]): void {
  if (!schema.log) schema.log = new ArraySchema<string>();
  while (schema.log.length < log.length) {
    schema.log.push(JSON.stringify(log[schema.log.length]));
  }
}

/**
 * Writes `state` into `schema`, in place. Server-side only (called from
 * HotelRoom.syncState()) — see docs/hotel-0b-multiplayer-specifikacio.md §6.2/§8.
 */
export function applyHotelStateToSchema(schema: HotelStateSchema, state: HotelState): void {
  syncBoard(schema, state.board);
  syncLots(schema, state.lots);
  syncPlayers(schema, state.players);
  schema.currentPlayerIndex = state.currentPlayerIndex;
  schema.turnPhase = state.turnPhase;
  schema.lastMoveRoll = state.lastMoveRoll ?? undefined;
  schema.lastNightsRoll = state.lastNightsRoll ?? undefined;
  schema.lastBuildingPermitRoll = state.lastBuildingPermitRoll ?? undefined;
  schema.constructionLockedThisTurn = state.constructionLockedThisTurn;
  schema.pendingNightsRollLotId = state.pendingNightsRollLotId ?? undefined;
  syncConstructionPlan(schema, state.pendingConstructionPlan);
  syncDebt(schema, state.pendingDebt);
  syncAuction(schema, state.pendingAuction);
  schema.staircasePurchaseRightActive = state.staircasePurchaseRightActive;
  if (!schema.lotsWithStaircasePurchasedThisTurn) schema.lotsWithStaircasePurchasedThisTurn = new ArraySchema<string>();
  replaceStringArray(schema.lotsWithStaircasePurchasedThisTurn, state.lotsWithStaircasePurchasedThisTurn);
  schema.status = state.status;
  schema.winnerId = state.winnerId ?? undefined;
  syncLog(schema, state.log);
}

function staticBoardSpace(id: string): BoardSpace {
  const space = BOARD_SPACES.find((candidate) => candidate.id === id);
  if (!space) throw new Error(`Unknown board space: ${id}`);
  return space;
}

function staticHotelConfig(id: string) {
  const config = HOTEL_CONFIGS.find((candidate) => candidate.id === id);
  if (!config) throw new Error(`Unknown hotel: ${id}`);
  return config;
}

/**
 * Rebuilds a plain HotelState from the wire schema, client-side — the
 * inverse of applyHotelStateToSchema, re-merging the synced mutable fields
 * with the static config data both sides already share via hotelConfigs.ts.
 * Used as the `decode` function ColyseusGameTransport calls on every state change.
 */
function decodeConstructionPlan(schema: HotelStateSchema): ConstructionPlanItem[] | null {
  if (schema.pendingConstructionPlan.length === 0) return null;
  return schema.pendingConstructionPlan.map((item) => ({
    lotId: item.lotId,
    buildingCount: item.buildingCount,
    buildGarden: item.buildGarden,
  }));
}

function decodeDebt(schema: HotelStateSchema): PendingDebt | null {
  if (!schema.pendingDebt) return null;
  return { amount: schema.pendingDebt.amount, creditorId: schema.pendingDebt.creditorId ?? null };
}

function decodeAuction(schema: HotelStateSchema): PendingAuction | null {
  if (!schema.pendingAuction) return null;
  return {
    lotId: schema.pendingAuction.lotId,
    auctioneerId: schema.pendingAuction.auctioneerId,
    highestBid: schema.pendingAuction.highestBid,
    highestBidderId: schema.pendingAuction.highestBidderId ?? null,
    passedPlayerIds: [...schema.pendingAuction.passedPlayerIds],
    currentBidderId: schema.pendingAuction.currentBidderId,
  };
}

export function decodeHotelStateSchema(schema: HotelStateSchema): HotelState {
  return {
    board: schema.board.map((spaceSchema) => ({
      ...staticBoardSpace(spaceSchema.id),
      staircaseForLotId: spaceSchema.staircaseForLotId ?? null,
    })),
    specialLanes: SPECIAL_LANES,
    lots: schema.lots.map((lotSchema) => ({
      ...staticHotelConfig(lotSchema.id),
      ownerId: lotSchema.ownerId ?? null,
      buildingsBuilt: lotSchema.buildingsBuilt,
      hasGarden: lotSchema.hasGarden,
      bankBuybackPrice: lotSchema.bankBuybackPrice ?? null,
    })),
    players: schema.players.map((playerSchema) => ({
      id: playerSchema.id,
      name: playerSchema.name,
      cash: playerSchema.cash,
      position: playerSchema.position,
      bankrupt: playerSchema.bankrupt,
    })),
    currentPlayerIndex: schema.currentPlayerIndex,
    turnPhase: schema.turnPhase as TurnPhase,
    lastMoveRoll: schema.lastMoveRoll ?? null,
    lastNightsRoll: schema.lastNightsRoll ?? null,
    pendingConstructionPlan: decodeConstructionPlan(schema),
    lastBuildingPermitRoll: (schema.lastBuildingPermitRoll as BuildingPermitResult | undefined) ?? null,
    constructionLockedThisTurn: schema.constructionLockedThisTurn,
    pendingNightsRollLotId: schema.pendingNightsRollLotId ?? null,
    pendingDebt: decodeDebt(schema),
    pendingAuction: decodeAuction(schema),
    staircasePurchaseRightActive: schema.staircasePurchaseRightActive,
    lotsWithStaircasePurchasedThisTurn: [...schema.lotsWithStaircasePurchasedThisTurn],
    status: schema.status as HotelStatus,
    winnerId: schema.winnerId ?? null,
    log: schema.log.map((entry) => JSON.parse(entry) as LogEntry),
  };
}
