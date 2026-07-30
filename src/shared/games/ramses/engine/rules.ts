import type { Player, PlayerId, RamsesCell, RamsesState, RamsesTurnPhase } from './state';
import { TREASURE_CONFIGS } from './treasureConfigs';

/** Confirmed by the user against the physical board — see docs/ramses-0a-specifikacio.md §4. */
export const BOARD_ROWS = 6;
export const BOARD_COLS = 8;

const ADJACENT_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function getCell(board: RamsesCell[], cellId: string): RamsesCell {
  const cell = board.find((c) => c.id === cellId);
  if (!cell) throw new Error(`Unknown cell: ${cellId}`);
  return cell;
}

/** Orthogonal (4-directional) neighbors only — no diagonals, see docs/ramses-0a-specifikacio.md §4. */
export function getAdjacentCellIds(board: RamsesCell[], cellId: string): string[] {
  const { row, col } = getCell(board, cellId);
  return ADJACENT_DELTAS.map(([dr, dc]) => board.find((c) => c.row === row + dr && c.col === col + dc))
    .filter((c): c is RamsesCell => c !== undefined)
    .map((c) => c.id);
}

/** SLIDE_PYRAMID is legal in the normal search AND during any special card's own slide-chain — never during a NAMING phase (those need a NAME_* action instead). */
const SLIDE_ALLOWED_PHASES: readonly RamsesTurnPhase[] = [
  'SEARCHING',
  'AWAITING_GIFT_SLIDE',
  'AWAITING_RISK_SLIDE',
  'AWAITING_POKER_SLIDE',
  'AWAITING_FATA_MORGANA_SLIDE',
];

export function canSlidePyramid(state: RamsesState, fromCellId: string): boolean {
  if (state.status !== 'IN_PROGRESS') return false;
  if (!SLIDE_ALLOWED_PHASES.includes(state.turnPhase)) return false;
  const cell = state.board.find((c) => c.id === fromCellId);
  if (!cell || !cell.hasPyramid) return false;
  return getAdjacentCellIds(state.board, state.emptyCellId).includes(fromCellId);
}

/** Next ACTIVE (non-forfeited) player index after `fromPlayerId`'s own seat — skips forfeited players, same "walk the circle, skip the inactive" pattern as Hotel's nextActivePlayerIndex. Defensively falls back to `fromPlayerId`'s own index if every other seat is forfeited (shouldn't happen — the game ends once only one active player remains, see reducer.ts's applyForfeit). */
export function nextActivePlayerIndexAfter(state: RamsesState, fromPlayerId: PlayerId): number {
  const total = state.players.length;
  let index = playerIndexOf(state, fromPlayerId);
  for (let i = 0; i < total; i += 1) {
    index = (index + 1) % total;
    if (!state.players[index].forfeited) return index;
  }
  return playerIndexOf(state, fromPlayerId);
}

export function nextPlayerIndex(state: RamsesState): number {
  return nextActivePlayerIndexAfter(state, state.players[state.currentPlayerIndex].id);
}

export function activePlayerCount(state: RamsesState): number {
  return state.players.filter((p) => !p.forfeited).length;
}

/** Only during a normal turn (never mid-special-card-resolution — see docs/ramses-0a-specifikacio.md, this avoids ever having to unwind a pendingSpecialEffect that named/handed control to the forfeiting player). */
export function canForfeit(state: RamsesState): boolean {
  return state.status === 'IN_PROGRESS' && state.turnPhase === 'SEARCHING';
}

export function playerIndexOf(state: RamsesState, playerId: PlayerId): number {
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index === -1) throw new Error(`Unknown player: ${playerId}`);
  return index;
}

/** Renames a player after creation — needed online, where the real display name isn't known until GameRoom.onPlayerAdmitted, unlike hot-seat's createInitialState (see docs/ramses-0b-specifikacio.md §3.5). Mirrors Hotel's updatePlayer. */
export function renamePlayer(state: RamsesState, playerId: PlayerId, name: string): RamsesState {
  return {
    ...state,
    players: state.players.map((player) => (player.id === playerId ? { ...player, name } : player)),
  };
}

/**
 * The one real cell whose FIXED, physical treasureId matches — each of the
 * 12 treasures has exactly one 2x2-subgrid cell (see docs/ramses-0a-specifikacio.md
 * §2.2), so this is always unambiguous.
 */
function staticTreasureCell(board: RamsesCell[], treasureId: string): RamsesCell | undefined {
  return board.find((c) => c.treasureId === treasureId);
}

function antipodalCellId(row: number, col: number): string {
  return `r${BOARD_ROWS - 1 - row}c${BOARD_COLS - 1 - col}`;
}

/**
 * What a player actually SEES at `cellId` right now, accounting for Homokvihar
 * (Sandstorm) — see state.ts's `treasureLayerRotated` doc comment. Every
 * treasureId comparison (activeCard/pendingSpecialEffect targets, rendering)
 * must go through this instead of reading `RamsesCell.treasureId` directly.
 */
export function effectiveTreasureId(state: RamsesState, cellId: string): string | null {
  const cell = getCell(state.board, cellId);
  if (!state.treasureLayerRotated) return cell.treasureId;
  return getCell(state.board, antipodalCellId(cell.row, cell.col)).treasureId;
}

function isKnownTreasureId(state: RamsesState, treasureId: string): boolean {
  return staticTreasureCell(state.board, treasureId) !== undefined;
}

/**
 * Whether `treasureId` is CURRENTLY visible — the "still hidden" gate every
 * naming action (Ajándék/Kockázat/Sivatagi póker) shares, see
 * docs/ramses-0a-specifikacio.md §8.2. Confirmed by the user (2026-07-30):
 * "revealed" always means "no pyramid over it RIGHT NOW", and at most ONE
 * cell on the whole board is ever pyramid-free at a time — sliding a
 * pyramid into the previously-empty cell covers it BACK up (classic 15-puzzle
 * mechanics, see moveEmptyCellTo in reducer.ts). So there's no accumulating
 * "history" of revealed treasures to track; only `state.emptyCellId`'s own
 * (effective) treasureId is ever "revealed" at any given moment — a human
 * player remembering an EARLIER reveal is exactly what the separate AI
 * RevealMemory system (ai/memory.ts) models, not something the game state
 * itself tracks.
 *
 * Deliberately does NOT delegate to `effectiveTreasureId` — that function's
 * antipodal lookup assumes access to every cell's TRUE static treasureId,
 * which only holds server-side. On a MASKED (client/AI-facing) state, every
 * covered cell's treasureId is nulled (see toPublicRamsesState) — including
 * the antipodal cell `effectiveTreasureId` would try to read when rotated —
 * so calling it here broke this check for anyone but the server the moment
 * Homokvihar was in play (real bug, caught 2026-07-30: AI got permanently
 * stuck on a POKER naming decision because `getHiddenTreasureIds`, built on
 * this function, saw zero hidden treasures on its own masked view). Reading
 * `emptyCell.treasureId` directly works correctly in BOTH contexts: on a
 * masked state it's already the correct value (toPublicRamsesState bakes the
 * true effective value in specifically for this cell); on the true state
 * it's correct whenever unrotated, with the antipodal fallback below only
 * ever needed (and only ever able to run) server-side.
 */
export function isTreasureRevealed(state: RamsesState, treasureId: string): boolean {
  const emptyCell = getCell(state.board, state.emptyCellId);
  if (emptyCell.treasureId === treasureId) return true;
  if (!state.treasureLayerRotated) return false;
  const antipodal = getCell(state.board, antipodalCellId(emptyCell.row, emptyCell.col));
  return antipodal.treasureId === treasureId;
}

function currentPlayerId(state: RamsesState): PlayerId {
  return state.players[state.currentPlayerIndex].id;
}

export function canNameGiftTarget(state: RamsesState, treasureId: string): boolean {
  if (state.status !== 'IN_PROGRESS' || state.turnPhase !== 'AWAITING_GIFT_TARGET') return false;
  return isKnownTreasureId(state, treasureId) && !isTreasureRevealed(state, treasureId);
}

export function canNameRiskTreasures(state: RamsesState, treasureIds: [string, string]): boolean {
  if (state.status !== 'IN_PROGRESS' || state.turnPhase !== 'AWAITING_RISK_NAMING') return false;
  const [first, second] = treasureIds;
  if (first === second) return false;
  return [first, second].every((id) => isKnownTreasureId(state, id) && !isTreasureRevealed(state, id));
}

export function canNamePokerChallenge(state: RamsesState, treasureId: string, targetPlayerId: PlayerId): boolean {
  if (state.status !== 'IN_PROGRESS' || state.turnPhase !== 'AWAITING_POKER_NAMING') return false;
  if (targetPlayerId === currentPlayerId(state)) return false; // "rajtad kívül" — 2.5 Sivatagi póker
  // A forfeited player can never be handed the temporary "searcher" turn
  // (applyNamePokerChallenge) — nobody would ever act for them, softlocking
  // the game. Re-checked here (not just filtered out of the UI's own
  // player-picker) since this is the actual authority a malicious/buggy
  // client can't bypass.
  const target = state.players.find((p) => p.id === targetPlayerId);
  if (!target || target.forfeited) return false;
  return isKnownTreasureId(state, treasureId) && !isTreasureRevealed(state, treasureId);
}

/**
 * Every still-hidden treasureId, for building the naming wheel's slices
 * (client-side) — see docs/ramses-0a-specifikacio.md §8.4. Starts from the
 * fixed, PUBLICLY known list of the 12 real treasures (TREASURE_CONFIGS —
 * which 12 treasures EXIST is never secret, only where each one sits is),
 * not from scanning `state.board` for non-null treasureId — that would only
 * ever find (at most) the one currently-uncovered cell on a MASKED state,
 * since every covered cell's treasureId is nulled there (real bug, caught
 * 2026-07-30 — see isTreasureRevealed's identical note).
 */
export function getHiddenTreasureIds(state: RamsesState): string[] {
  return TREASURE_CONFIGS.map((treasure) => treasure.id).filter((treasureId) => !isTreasureRevealed(state, treasureId));
}

export function scoreOf(player: Player): number {
  return player.wonCards.reduce((sum, card) => sum + card.points, 0);
}

/**
 * Highest score wins; ties broken by most cards won; a still-remaining tie
 * means everyone involved co-wins (see docs/ramses-0a-specifikacio.md §2.4).
 * A forfeited player is never eligible to win (they keep whatever they'd
 * already won, but dropped out) — falls back to the full roster only in the
 * unreachable case where everyone has forfeited, so this never throws on an
 * empty Math.max.
 */
export function computeWinnerIds(players: Player[]): PlayerId[] {
  const eligible = players.filter((p) => !p.forfeited);
  const pool = eligible.length > 0 ? eligible : players;
  const maxScore = Math.max(...pool.map(scoreOf));
  const topByScore = pool.filter((p) => scoreOf(p) === maxScore);
  if (topByScore.length === 1) return [topByScore[0].id];

  const maxCards = Math.max(...topByScore.map((p) => p.wonCards.length));
  return topByScore.filter((p) => p.wonCards.length === maxCards).map((p) => p.id);
}

/**
 * Masks whatever must stay hidden before `state` goes over the network —
 * the ONE place this happens, used by both the per-field schema sync and the
 * requestFullSync safety net (see docs/ramses-0b-specifikacio.md §3.1/3.2).
 * A still-covered cell's `treasureId` is nulled — structurally indistinguishable
 * from a genuinely blank cell, which is exactly the point (the client can't
 * tell the difference until it's actually revealed). The one UNCOVERED cell
 * gets `effectiveTreasureId(state, state.emptyCellId)` — NOT its own raw
 * static value — since after a Homokvihar rotation those two can differ
 * (real bug, caught 2026-07-30: the client always rendered/reasoned about a
 * covered-or-not cell's OWN treasureId, so a rotation made the wrong treasure
 * show at the empty cell, or nothing at all). `drawPile`'s real cards are
 * replaced with length-matched placeholders (never real treasureId/points/
 * specialType) — its order/contents never leave the server, but the COUNT
 * stays meaningful (`state.drawPile.length`).
 */
export function toPublicRamsesState(state: RamsesState): RamsesState {
  const visibleTreasureId = effectiveTreasureId(state, state.emptyCellId);
  return {
    ...state,
    board: state.board.map((cell) =>
      cell.id === state.emptyCellId ? { ...cell, treasureId: visibleTreasureId } : { ...cell, treasureId: null },
    ),
    drawPile: state.drawPile.map((_, index) => ({ kind: 'treasure', id: `hidden-${index}`, treasureId: '', points: 0 })),
  };
}
