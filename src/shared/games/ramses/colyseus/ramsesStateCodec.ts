import { ArraySchema } from '@colyseus/schema';
import { replaceStringArray } from '../../../core/colyseusSyncHelpers';
import { toPublicRamsesState } from '../engine/rules';
import type {
  DrawnCard,
  PendingSpecialEffect,
  Player,
  RamsesCell,
  RamsesLogEntry,
  RamsesState,
  RamsesStatus,
  RamsesTurnPhase,
  TreasureCard,
} from '../engine/state';
import { PendingSpecialEffectSchema, RamsesCellSchema, RamsesPlayerSchema, RamsesStateSchema, TreasureCardSchema } from './RamsesStateSchema';

function syncTreasureCardFields(schema: TreasureCardSchema, card: TreasureCard): void {
  schema.id = card.id;
  schema.treasureId = card.treasureId;
  schema.points = card.points;
}

/** First call creates the (fixed-length, never reordered) schema elements — cell id/row/col never change after setup, only treasureId/hasPyramid do. */
function syncBoard(schema: RamsesStateSchema, board: RamsesCell[]): void {
  if (!schema.board) {
    schema.board = new ArraySchema(
      ...board.map((cell) => {
        const cellSchema = new RamsesCellSchema();
        cellSchema.id = cell.id;
        cellSchema.row = cell.row;
        cellSchema.col = cell.col;
        cellSchema.treasureId = cell.treasureId ?? undefined;
        cellSchema.hasPyramid = cell.hasPyramid;
        return cellSchema;
      }),
    );
    return;
  }
  board.forEach((cell, i) => {
    schema.board[i].treasureId = cell.treasureId ?? undefined;
    schema.board[i].hasPyramid = cell.hasPyramid;
  });
}

function syncActiveCard(schema: RamsesStateSchema, card: TreasureCard | null): void {
  if (!card) {
    schema.activeCard = undefined;
    return;
  }
  if (!schema.activeCard) schema.activeCard = new TreasureCardSchema();
  syncTreasureCardFields(schema.activeCard, card);
}

function clearPendingSpecialEffectVariantFields(target: PendingSpecialEffectSchema): void {
  target.holderId = undefined;
  target.targetTreasureId = undefined;
  target.riskTreasureId1 = undefined;
  target.riskTreasureId2 = undefined;
  target.firstFound = undefined;
  target.searcherId = undefined;
  target.pokerTreasureId = undefined;
  target.neighborId = undefined;
  target.cardId = undefined;
  target.cardTreasureId = undefined;
  target.cardPoints = undefined;
}

function syncGiftFields(target: PendingSpecialEffectSchema, effect: Extract<PendingSpecialEffect, { type: 'GIFT' }>): void {
  target.holderId = effect.holderId;
  target.targetTreasureId = effect.targetTreasureId ?? undefined;
}

function syncRiskFields(target: PendingSpecialEffectSchema, effect: Extract<PendingSpecialEffect, { type: 'RISK' }>): void {
  target.riskTreasureId1 = effect.treasureIds[0];
  target.riskTreasureId2 = effect.treasureIds[1];
  target.firstFound = effect.firstFound;
}

function syncPokerFields(target: PendingSpecialEffectSchema, effect: Extract<PendingSpecialEffect, { type: 'POKER' }>): void {
  target.searcherId = effect.searcherId;
  target.pokerTreasureId = effect.treasureId ?? undefined;
}

function syncFataMorganaFields(target: PendingSpecialEffectSchema, effect: Extract<PendingSpecialEffect, { type: 'FATA_MORGANA' }>): void {
  target.neighborId = effect.neighborId;
  target.cardId = effect.card.id;
  target.cardTreasureId = effect.card.treasureId;
  target.cardPoints = effect.card.points;
}

/** Flattens the discriminated union onto PendingSpecialEffectSchema's side-by-side fields — see that class's own doc comment. */
function syncPendingSpecialEffect(schema: RamsesStateSchema, effect: PendingSpecialEffect | null): void {
  if (!effect) {
    schema.pendingSpecialEffect = undefined;
    return;
  }
  if (!schema.pendingSpecialEffect) schema.pendingSpecialEffect = new PendingSpecialEffectSchema();
  const target = schema.pendingSpecialEffect;
  target.type = effect.type;
  target.drawerId = effect.drawerId;
  clearPendingSpecialEffectVariantFields(target);
  if (effect.type === 'GIFT') syncGiftFields(target, effect);
  else if (effect.type === 'RISK') syncRiskFields(target, effect);
  else if (effect.type === 'POKER') syncPokerFields(target, effect);
  else syncFataMorganaFields(target, effect);
}

/** Push-only — a player's won-cards pile only ever grows during a game, never shrinks/reorders during the NORMAL flow, but special-card resolution (Ajándék/Kockázat/Sivatagi póker/Fata Morgana) can also REMOVE a card from a player — so this has to fully replace the array's contents each sync, not just push new tail entries like Hotel's/this file's own `syncLog`. */
function syncWonCards(schema: RamsesPlayerSchema, wonCards: TreasureCard[]): void {
  if (!schema.wonCards) schema.wonCards = new ArraySchema<TreasureCardSchema>();
  schema.wonCards.splice(0, schema.wonCards.length);
  for (const card of wonCards) {
    const cardSchema = new TreasureCardSchema();
    syncTreasureCardFields(cardSchema, card);
    schema.wonCards.push(cardSchema);
  }
}

function syncPlayers(schema: RamsesStateSchema, players: Player[]): void {
  if (!schema.players) {
    schema.players = new ArraySchema(
      ...players.map((player) => {
        const playerSchema = new RamsesPlayerSchema();
        playerSchema.id = player.id;
        playerSchema.name = player.name;
        playerSchema.forfeited = player.forfeited;
        syncWonCards(playerSchema, player.wonCards);
        return playerSchema;
      }),
    );
    return;
  }
  players.forEach((player, i) => {
    schema.players[i].name = player.name; // the only OTHER field that can change after creation, see renamePlayer
    schema.players[i].forfeited = player.forfeited;
    syncWonCards(schema.players[i], player.wonCards);
  });
}

/** Push-only — never cleared, so only newly-added entries are ever sent over the wire. Same encoding as Hotel's own syncLog (hotelStateCodec.ts). */
function syncLog(schema: RamsesStateSchema, log: RamsesLogEntry[]): void {
  if (!schema.log) schema.log = new ArraySchema<string>();
  while (schema.log.length < log.length) {
    schema.log.push(JSON.stringify(log[schema.log.length]));
  }
}

/**
 * Writes `state` into `schema`, in place — server-side only (called from
 * RamsesRoom.syncState()). Takes the TRUE, unmasked engine state and masks
 * it internally via `toPublicRamsesState` before writing anything, so a
 * caller can never forget the masking step (see docs/ramses-0b-specifikacio.md
 * §3.1/3.3) — the one deviation from Hotel's codec, which never needed this
 * distinction since Hotel has no hidden information.
 */
export function applyRamsesStateToSchema(schema: RamsesStateSchema, state: RamsesState): void {
  const publicState = toPublicRamsesState(state);
  syncBoard(schema, publicState.board);
  schema.emptyCellId = publicState.emptyCellId;
  syncActiveCard(schema, publicState.activeCard);
  schema.turnPhase = publicState.turnPhase;
  syncPendingSpecialEffect(schema, publicState.pendingSpecialEffect);
  schema.treasureLayerRotated = publicState.treasureLayerRotated;
  schema.drawPileCount = state.drawPile.length; // from the TRUE state — masking only replaces contents, length is identical either way
  syncPlayers(schema, publicState.players);
  schema.currentPlayerIndex = publicState.currentPlayerIndex;
  schema.status = publicState.status;
  if (!schema.winnerIds) schema.winnerIds = new ArraySchema<string>();
  replaceStringArray(schema.winnerIds, publicState.winnerIds);
  // The log is diagnostic-only (see docs/shell-ux-specifikacio.md §4.2.1) and
  // never itself hidden information — synced from the TRUE state directly,
  // not `publicState`, same reasoning as drawPileCount above.
  syncLog(schema, state.log);
}

function decodeTreasureCard(schema: TreasureCardSchema): TreasureCard {
  return { kind: 'treasure', id: schema.id, treasureId: schema.treasureId, points: schema.points };
}

function decodePendingSpecialEffect(schema: PendingSpecialEffectSchema | undefined): PendingSpecialEffect | null {
  if (!schema) return null;
  switch (schema.type) {
    case 'GIFT':
      return { type: 'GIFT', drawerId: schema.drawerId, holderId: schema.holderId!, targetTreasureId: schema.targetTreasureId ?? null };
    case 'RISK':
      return {
        type: 'RISK',
        drawerId: schema.drawerId,
        treasureIds: [schema.riskTreasureId1!, schema.riskTreasureId2!],
        firstFound: schema.firstFound ?? false,
      };
    case 'POKER':
      return {
        type: 'POKER',
        drawerId: schema.drawerId,
        searcherId: schema.searcherId!,
        treasureId: schema.pokerTreasureId ?? null,
      };
    case 'FATA_MORGANA':
      return {
        type: 'FATA_MORGANA',
        drawerId: schema.drawerId,
        neighborId: schema.neighborId!,
        card: { kind: 'treasure', id: schema.cardId!, treasureId: schema.cardTreasureId!, points: schema.cardPoints! },
      };
    default:
      return null;
  }
}

/**
 * Rebuilds a plain (already-masked) RamsesState from the wire schema,
 * client-side — the inverse of applyRamsesStateToSchema. `drawPile` is
 * reconstructed as `drawPileCount` length-matched placeholders (never real
 * cards) so `getDrawPileCount`/anything reading `.drawPile.length` works
 * unchanged, exactly mirroring what `toPublicRamsesState` itself produces
 * server-side — see docs/ramses-0b-specifikacio.md §3.3.
 */
export function decodeRamsesStateSchema(schema: RamsesStateSchema): RamsesState {
  const placeholderPile: DrawnCard[] = Array.from({ length: schema.drawPileCount }, (_, i) => ({
    kind: 'treasure',
    id: `hidden-${i}`,
    treasureId: '',
    points: 0,
  }));
  return {
    board: schema.board.map((cellSchema) => ({
      id: cellSchema.id,
      row: cellSchema.row,
      col: cellSchema.col,
      treasureId: cellSchema.treasureId ?? null,
      hasPyramid: cellSchema.hasPyramid,
    })),
    emptyCellId: schema.emptyCellId,
    drawPile: placeholderPile,
    activeCard: schema.activeCard ? decodeTreasureCard(schema.activeCard) : null,
    turnPhase: schema.turnPhase as RamsesTurnPhase,
    pendingSpecialEffect: decodePendingSpecialEffect(schema.pendingSpecialEffect),
    treasureLayerRotated: schema.treasureLayerRotated,
    players: schema.players.map((playerSchema) => ({
      id: playerSchema.id,
      name: playerSchema.name,
      wonCards: playerSchema.wonCards.map(decodeTreasureCard),
      forfeited: playerSchema.forfeited,
    })),
    currentPlayerIndex: schema.currentPlayerIndex,
    status: schema.status as RamsesStatus,
    winnerIds: [...schema.winnerIds],
    log: schema.log.map((entry) => JSON.parse(entry) as RamsesLogEntry),
  };
}
