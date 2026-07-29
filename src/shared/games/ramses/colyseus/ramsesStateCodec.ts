import { ArraySchema } from '@colyseus/schema';
import { replaceStringArray } from '../../../core/colyseusSyncHelpers';
import { toPublicRamsesState } from '../engine/rules';
import type { Player, RamsesCell, RamsesLogEntry, RamsesState, RamsesStatus, SearchCard } from '../engine/state';
import { RamsesCellSchema, RamsesPlayerSchema, RamsesStateSchema, SearchCardSchema } from './RamsesStateSchema';

function syncSearchCardFields(schema: SearchCardSchema, card: SearchCard): void {
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

function syncActiveCard(schema: RamsesStateSchema, card: SearchCard | null): void {
  if (!card) {
    schema.activeCard = undefined;
    return;
  }
  if (!schema.activeCard) schema.activeCard = new SearchCardSchema();
  syncSearchCardFields(schema.activeCard, card);
}

/** Push-only — a player's won-cards pile only ever grows during a game, never shrinks/reorders, so only newly-added cards are ever sent over the wire (same principle as Hotel's log). */
function syncWonCards(schema: RamsesPlayerSchema, wonCards: SearchCard[]): void {
  if (!schema.wonCards) schema.wonCards = new ArraySchema<SearchCardSchema>();
  while (schema.wonCards.length < wonCards.length) {
    const cardSchema = new SearchCardSchema();
    syncSearchCardFields(cardSchema, wonCards[schema.wonCards.length]);
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
        syncWonCards(playerSchema, player.wonCards);
        return playerSchema;
      }),
    );
    return;
  }
  players.forEach((player, i) => {
    schema.players[i].name = player.name; // the only field that can change after creation, see renamePlayer
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

function decodeSearchCard(schema: SearchCardSchema): SearchCard {
  return { id: schema.id, treasureId: schema.treasureId, points: schema.points };
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
  return {
    board: schema.board.map((cellSchema) => ({
      id: cellSchema.id,
      row: cellSchema.row,
      col: cellSchema.col,
      treasureId: cellSchema.treasureId ?? null,
      hasPyramid: cellSchema.hasPyramid,
    })),
    emptyCellId: schema.emptyCellId,
    drawPile: Array.from({ length: schema.drawPileCount }, (_, i) => ({
      id: `hidden-${i}`,
      treasureId: '',
      points: 0,
    })),
    activeCard: schema.activeCard ? decodeSearchCard(schema.activeCard) : null,
    players: schema.players.map((playerSchema) => ({
      id: playerSchema.id,
      name: playerSchema.name,
      wonCards: playerSchema.wonCards.map(decodeSearchCard),
    })),
    currentPlayerIndex: schema.currentPlayerIndex,
    status: schema.status as RamsesStatus,
    winnerIds: [...schema.winnerIds],
    log: schema.log.map((entry) => JSON.parse(entry) as RamsesLogEntry),
  };
}
