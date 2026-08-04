import { getCardDef } from './cardDefs';
import type { CardDef, Row } from './types';
import type { CardInstance, GwentLogEntry, GwentState, PlayerId, PlayerState } from './state';
import { agileAutoOptimizes, isLeaderAutoHornRow, medicPicksRandomTarget, spyPowerMultiplier } from './leaderPassives';
import { BOVINE_DEFENSE_FORCE_CARD_ID, COW_CARD_ID, DANDELION_CARD_ID, HIDDEN_CARD_DEF_ID } from './specialCardIds';

export const ROWS: Row[] = ['Melee', 'Ranged', 'Siege'];

// --- Accessors / immutable updaters (same role as Hotel's rules.ts helpers) ---

export function getPlayer(state: GwentState, playerId: PlayerId): PlayerState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Unknown Gwent player: ${playerId}`);
  return player;
}

export function getOpponent(state: GwentState, playerId: PlayerId): PlayerState {
  const opponent = state.players.find((p) => p.id !== playerId);
  if (!opponent) throw new Error(`No opponent for Gwent player: ${playerId}`);
  return opponent;
}

export function getCurrentPlayer(state: GwentState): PlayerState {
  return state.players[state.currentPlayerIndex];
}

export function updatePlayer(state: GwentState, playerId: PlayerId, patch: Partial<PlayerState>): GwentState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)) as [PlayerState, PlayerState],
  };
}

export function updateBoardRow(
  state: GwentState,
  playerId: PlayerId,
  row: Row,
  patch: Partial<PlayerState['board'][Row]>,
): GwentState {
  const player = getPlayer(state, playerId);
  return updatePlayer(state, playerId, { board: { ...player.board, [row]: { ...player.board[row], ...patch } } });
}

export function appendLog(state: GwentState, entry: GwentLogEntry): GwentState {
  return { ...state, log: [...state.log, entry] };
}

export function findCardOnPlayerBoard(player: PlayerState, instanceId: string): { row: Row; instance: CardInstance } | null {
  for (const row of ROWS) {
    const instance = player.board[row].cards.find((c) => c.instanceId === instanceId);
    if (instance) return { row, instance };
  }
  return null;
}

// --- Power computation — order LOCKED by docs/gwent-0a-specifikacio.md §3.2: ---
// baseStrength -> weather -> Tight Bond -> Morale Boost -> Horn/Dandelion -> Spy leader multiplier (new, see below).

/** `rowOwnerId` is whichever player's board zone this row physically belongs to right now — for a Spy card that's the OPPONENT of whoever played it, since Spy places into the opponent's own board row. */
export function computeCardPower(state: GwentState, rowOwnerId: PlayerId, row: Row, instance: CardInstance): number {
  const def = getCardDef(instance.defId);
  if (def.basePower === null) return 0;
  if (def.abilities.includes('Hero')) return def.basePower; // immune to every modifier, including weather/Horn/leader multipliers.

  const rowState = getPlayer(state, rowOwnerId).board[row];
  let power = state.activeWeatherRows.includes(row) ? 1 : def.basePower;

  if (def.abilities.includes('TightBond')) {
    const siblingCount = rowState.cards.filter((c) => c.instanceId !== instance.instanceId && c.defId === instance.defId).length;
    power *= 2 ** siblingCount;
  }

  const moraleBoostSources = rowState.cards.filter(
    (c) => c.instanceId !== instance.instanceId && getCardDef(c.defId).abilities.includes('MoraleBoost'),
  ).length;
  power += moraleBoostSources;

  // Dandelion's built-in effect is IDENTICAL to a real Horn — doubles every
  // card in the row, itself included, persistently — and the two never
  // stack: a row with both a real/leader-auto Horn AND Dandelion still only
  // doubles once (felhasználó correction 2026-08-04; previously this
  // multiplied by 2 for Horn AND separately by 2 for Dandelion, quadrupling
  // power on a row with both, and Dandelion excluded itself from its own
  // doubling — both wrong).
  if (effectiveHornActive(state, rowOwnerId, row) || rowState.dandelionActive) power *= 2;

  // Not part of the originally-locked sequence (that predates leader abilities) — applied last as a
  // clean multiplicative pass on top, since it's sourced from an entirely separate mechanic (a leader).
  if (def.abilities.includes('Spy')) power *= spyPowerMultiplier(state);

  return power;
}

/** A real Horn card OR one of the 3 "double this row unless Horn's already there" leader passives — never stacks (rules.ts §leaderPassives). */
export function effectiveHornActive(state: GwentState, rowOwnerId: PlayerId, row: Row): boolean {
  const rowState = getPlayer(state, rowOwnerId).board[row];
  return rowState.hornActive || isLeaderAutoHornRow(state, rowOwnerId, row);
}

export function computeRowTotal(state: GwentState, playerId: PlayerId, row: Row): number {
  return getPlayer(state, playerId).board[row].cards.reduce((sum, card) => sum + computeCardPower(state, playerId, row, card), 0);
}

export function computeSideTotal(state: GwentState, playerId: PlayerId): number {
  const player = getPlayer(state, playerId);
  return ROWS.reduce(
    (sum, row) => sum + player.board[row].cards.reduce((rowSum, card) => rowSum + computeCardPower(state, playerId, row, card), 0),
    0,
  );
}

export interface RoundOutcome {
  winnerId: PlayerId | null;
  tie: boolean;
  totals: Record<PlayerId, number>;
}

export function resolveRoundOutcome(state: GwentState): RoundOutcome {
  const [a, b] = state.players;
  const totals: Record<PlayerId, number> = { [a.id]: computeSideTotal(state, a.id), [b.id]: computeSideTotal(state, b.id) };
  if (totals[a.id] === totals[b.id]) {
    const nilfgaardPlayers = state.players.filter((p) => p.faction === 'Nilfgaard');
    // Nilfgaard auto-wins a tie — but only when it's decisive (exactly one side has the bonus).
    if (nilfgaardPlayers.length === 1) return { winnerId: nilfgaardPlayers[0].id, tie: false, totals };
    return { winnerId: null, tie: true, totals };
  }
  return { winnerId: totals[a.id] > totals[b.id] ? a.id : b.id, tie: false, totals };
}

export function applyWeatherEffect(state: GwentState, weatherRow: Row | 'AllRows'): GwentState {
  if (weatherRow === 'AllRows') return { ...state, activeWeatherRows: [] };
  if (state.activeWeatherRows.includes(weatherRow)) return state;
  return { ...state, activeWeatherRows: [...state.activeWeatherRows, weatherRow] };
}

// --- Turn-order helper ---

/** Who acts next after `actingPlayerId` just took an action (played a card, or passed) — see docs/diagrams/gwent-0a-turn-flow.puml. */
export function nextTurnPlayerIndex(state: GwentState, actingPlayerId: PlayerId): number {
  const opponent = getOpponent(state, actingPlayerId);
  if (opponent.passed) return state.players.findIndex((p) => p.id === actingPlayerId);
  return state.players.findIndex((p) => p.id === opponent.id);
}

// --- Scoia'tael / starting-player helpers ---

/**
 * The single player whose Scoia'tael bonus decides who starts THIS round —
 * null if neither/both players are Scoia'tael (falls back to a coin flip),
 * OR if this isn't round 1. Real Gwent rule (Gwent-0c.3 correction,
 * 2026-08-04 — a previous round assumed this applied every round it was
 * decisive, which was wrong): Scoia'tael's "choose who starts" only ever
 * applies to the FIRST round of a match; round 2+ always follows the
 * standard "the previous round's loser starts" rule instead, even when a
 * Scoia'tael player is in the match.
 */
export function scoiaTaelDecisivePlayerId(state: GwentState): PlayerId | null {
  if (state.round !== 1) return null;
  const scoiaTaelPlayers = state.players.filter((p) => p.faction === 'Scoiatael');
  return scoiaTaelPlayers.length === 1 ? scoiaTaelPlayers[0].id : null;
}

export function canFlipStartingCoin(state: GwentState): boolean {
  return state.phase === 'AWAITING_START_CHOICE' && scoiaTaelDecisivePlayerId(state) === null;
}

export function canChooseStartingPlayer(state: GwentState, playerId: PlayerId): boolean {
  return state.phase === 'AWAITING_START_CHOICE' && scoiaTaelDecisivePlayerId(state) === playerId;
}

// --- Mulligan ---

export function canMulliganSwap(state: GwentState, playerId: PlayerId, instanceId: string): boolean {
  if (state.phase !== 'MULLIGAN') return false;
  const player = getPlayer(state, playerId);
  if (player.mulliganConfirmed || player.mulligansLeft <= 0) return false;
  return player.hand.some((c) => c.instanceId === instanceId);
}

export function canConfirmMulligan(state: GwentState, playerId: PlayerId): boolean {
  return state.phase === 'MULLIGAN' && !getPlayer(state, playerId).mulliganConfirmed;
}

// --- Playing a card / passing ---

function isDecoyChoiceValid(player: PlayerState, def: CardDef, decoyTargetInstanceId: string | undefined): boolean {
  if (def.kind !== 'Decoy') return decoyTargetInstanceId === undefined;
  return decoyTargetInstanceId !== undefined && findCardOnPlayerBoard(player, decoyTargetInstanceId) !== null;
}

function isRowChoiceValid(player: PlayerState, def: CardDef, chosenRow: Row | undefined): boolean {
  const isAgileUnit = def.kind === 'Unit' && def.abilities.includes('Agile');
  if (isAgileUnit) return agileAutoOptimizes(player) || chosenRow === 'Melee' || chosenRow === 'Ranged';
  if (def.kind === 'Horn') return chosenRow !== undefined;
  return chosenRow === undefined; // fixed-row units and every other special card never take a row choice
}

function isMedicChoiceValid(player: PlayerState, def: CardDef, medicReviveInstanceId: string | undefined): boolean {
  if (medicReviveInstanceId === undefined) return true; // always optional — omitting it just declines the revival
  if (def.kind !== 'Unit' || !def.abilities.includes('Medic')) return false;
  const target = player.discard.find((c) => c.instanceId === medicReviveInstanceId);
  if (!target) return false;
  const targetDef = getCardDef(target.defId);
  return targetDef.kind === 'Unit' && !targetDef.abilities.includes('Hero');
}

/**
 * The turn/phase/hand-membership gate shared by every PLAY_CARD attempt,
 * WITHOUT validating the card-specific extra fields (row/decoy target/medic
 * choice) — used by selectors.ts to decide whether a hand card is offered
 * at all (a UI collects the row/target choice in a follow-up step, after
 * the player has already picked the card), while `canPlayCard` below is the
 * strict, dispatch-time gate the reducer actually enforces.
 */
export function canAttemptToPlayCard(state: GwentState, playerId: PlayerId, instanceId: string): boolean {
  if (state.phase !== 'ROUND_IN_PROGRESS') return false;
  const player = getPlayer(state, playerId);
  if (getCurrentPlayer(state).id !== playerId || player.passed) return false;
  return player.hand.some((c) => c.instanceId === instanceId);
}

export function canPlayCard(
  state: GwentState,
  playerId: PlayerId,
  instanceId: string,
  chosenRow?: Row,
  decoyTargetInstanceId?: string,
  medicReviveInstanceId?: string,
): boolean {
  if (!canAttemptToPlayCard(state, playerId, instanceId)) return false;
  const player = getPlayer(state, playerId);
  const instance = player.hand.find((c) => c.instanceId === instanceId) as CardInstance;
  const def = getCardDef(instance.defId);

  return (
    isDecoyChoiceValid(player, def, decoyTargetInstanceId) &&
    isRowChoiceValid(player, def, chosenRow) &&
    isMedicChoiceValid(player, def, medicReviveInstanceId)
  );
}

export function canPass(state: GwentState, playerId: PlayerId): boolean {
  if (state.phase !== 'ROUND_IN_PROGRESS') return false;
  const player = getPlayer(state, playerId);
  return getCurrentPlayer(state).id === playerId && !player.passed;
}

export function canContinueAfterRound(state: GwentState): boolean {
  return state.phase === 'ROUND_RESOLVED';
}

// --- Muster / Medic ---

/** Every defId that a Muster trigger auto-plays alongside itself — same-defId copies plus any additive `mustersWithIds` group (Crones/Vampires/Gaunter O'Dimm, see docs §4.2). Never resolved by name. */
export function findMusterPartnerDefIds(defId: string): string[] {
  return [defId, ...getCardDef(defId).mustersWithIds];
}

export function eligibleMedicTargets(player: PlayerState): CardInstance[] {
  return player.discard.filter((c) => {
    const def = getCardDef(c.defId);
    return def.kind === 'Unit' && !def.abilities.includes('Hero');
  });
}

/** Resolves WHICH discard card a Medic revival brings back — random (Invader of the North, either side) or the player's own request; null = no valid/available target. */
export function pickMedicTarget(state: GwentState, playerId: PlayerId, requestedInstanceId: string | undefined): CardInstance | null {
  const eligible = eligibleMedicTargets(getPlayer(state, playerId));
  if (eligible.length === 0) return null;
  if (medicPicksRandomTarget(state)) return eligible[Math.floor(Math.random() * eligible.length)];
  if (!requestedInstanceId) return null; // player declined
  return eligible.find((c) => c.instanceId === requestedInstanceId) ?? null;
}

// --- Board mutation helpers shared by Scorch/RowScorch/Decoy ---

function computeDandelionActive(cards: CardInstance[]): boolean {
  return cards.some((c) => c.defId === DANDELION_CARD_ID);
}

/** Removes a card from a board row (recomputing the row's Dandelion flag) without deciding where it goes next — the caller sends it to discard (Scorch/RowScorch) or back to hand (Decoy). */
export function removeCardFromRow(
  state: GwentState,
  playerId: PlayerId,
  row: Row,
  instanceId: string,
): { state: GwentState; card: CardInstance | null } {
  const player = getPlayer(state, playerId);
  const card = player.board[row].cards.find((c) => c.instanceId === instanceId) ?? null;
  if (!card) return { state, card: null };
  const remainingCards = player.board[row].cards.filter((c) => c.instanceId !== instanceId);
  const next = updateBoardRow(state, playerId, row, { cards: remainingCards, dandelionActive: computeDandelionActive(remainingCards) });
  return { state: next, card };
}

/** Appends `instance` to a board row (recomputing the row's Dandelion flag) — the inverse of removeCardFromRow. `boardOwnerId` is whichever player's board zone the row physically belongs to (the opponent's, for a Spy card). */
export function placeCardOnRow(state: GwentState, boardOwnerId: PlayerId, row: Row, instance: CardInstance): GwentState {
  const cards = [...getPlayer(state, boardOwnerId).board[row].cards, instance];
  return updateBoardRow(state, boardOwnerId, row, { cards, dandelionActive: computeDandelionActive(cards) });
}

export function placeConjuredCard(state: GwentState, playerId: PlayerId, row: Row, defId: string): { state: GwentState; instanceId: string } {
  const instanceId = `${defId}-conjured-${Math.random().toString(36).slice(2, 10)}`;
  const next = placeCardOnRow(state, playerId, row, { instanceId, defId, chosenRow: null });
  return { state: next, instanceId };
}

export interface RowTarget {
  playerId: PlayerId;
  row: Row;
}

export interface DestroyResult {
  state: GwentState;
  destroyedInstanceIds: string[];
  cowReplacements: { playerId: PlayerId; row: Row; newInstanceId: string }[];
}

/** Shared by Scorch (targets: both players, all 3 rows) and RowScorch (targets: one opponent row) — destroys the strongest unit(s) among the targeted rows, ties destroy all, Hero units are immune. */
export function destroyStrongestAcross(state: GwentState, targets: RowTarget[]): DestroyResult {
  const candidates: { playerId: PlayerId; row: Row; instance: CardInstance; power: number }[] = [];
  for (const { playerId, row } of targets) {
    for (const card of getPlayer(state, playerId).board[row].cards) {
      if (getCardDef(card.defId).abilities.includes('Hero')) continue;
      candidates.push({ playerId, row, instance: card, power: computeCardPower(state, playerId, row, card) });
    }
  }
  if (candidates.length === 0) return { state, destroyedInstanceIds: [], cowReplacements: [] };
  const maxPower = Math.max(...candidates.map((c) => c.power));

  let next = state;
  const destroyedInstanceIds: string[] = [];
  const cowReplacements: DestroyResult['cowReplacements'] = [];
  for (const candidate of candidates.filter((c) => c.power === maxPower)) {
    const removal = removeCardFromRow(next, candidate.playerId, candidate.row, candidate.instance.instanceId);
    if (!removal.card) continue;
    next = removal.state;
    next = updatePlayer(next, candidate.playerId, { discard: [...getPlayer(next, candidate.playerId).discard, removal.card] });
    destroyedInstanceIds.push(candidate.instance.instanceId);
    if (removal.card.defId === COW_CARD_ID) {
      const conjured = placeConjuredCard(next, candidate.playerId, candidate.row, BOVINE_DEFENSE_FORCE_CARD_ID);
      next = conjured.state;
      cowReplacements.push({ playerId: candidate.playerId, row: candidate.row, newInstanceId: conjured.instanceId });
    }
  }
  return { state: next, destroyedInstanceIds, cowReplacements };
}

// --- Gwent-0b: player-specific hidden-info masking ---
// See docs/gwent-0b-multiplayer-specifikacio.md §3 — this is the ONE masking
// function, consumed by both GwentRoom (online, viewerId = the requesting
// client's own player, or null for the neutral shared view) and the local
// hot-seat "pass the device" gate (viewerId = whichever screen is currently
// shown). Unlike Ramses's toPublicRamsesState, the secret here is
// player-specific, not symmetric — hence the extra viewerId parameter.

/** Same-length replacement with sentinel cards — preserves `.length` (so hand/deck counts still render) without revealing any real defId. */
function maskCardInstances(cards: CardInstance[]): CardInstance[] {
  return cards.map((card) => ({ instanceId: card.instanceId, defId: HIDDEN_CARD_DEF_ID, chosenRow: null }));
}

/**
 * Returns a same-shaped `GwentState` with hidden information redacted from
 * `viewerId`'s perspective, per the authoritative masking rule (confirmed by
 * the user, 2026-08-03, overriding an earlier implementation attempt — see
 * docs/gwent-0b-multiplayer-specifikacio.md §3.1):
 * - `leaderId`/`leaderAbilityUsed`: always public (nobody's masked).
 * - `discard`: always public — already-played/discarded cards are visible to everyone.
 * - `hand`/`mulliganSetAside`: real only for the player whose id matches `viewerId`.
 * - `deck`: masked for EVERYONE, including its own owner — nobody, not even
 *   the drawing player, can see the draw pile's contents/order, exactly like
 *   Ramses's drawPile. `viewerId` never un-masks it.
 * `viewerId: null` masks every player's hand/mulliganSetAside too — the
 * neutral view broadcast identically to every connected client (see
 * GwentRoom.syncState()).
 */
export function toPublicGwentState(state: GwentState, viewerId: PlayerId | null): GwentState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      deck: maskCardInstances(player.deck),
      hand: player.id === viewerId ? player.hand : maskCardInstances(player.hand),
      mulliganSetAside: player.id === viewerId ? player.mulliganSetAside : maskCardInstances(player.mulliganSetAside),
    })) as [PlayerState, PlayerState],
  };
}

/**
 * Whose screen should currently be showing, in local hot-seat mode — the
 * `viewerId` fed into `toPublicGwentState` for the "pass the device" gate
 * (see GwentGamePage.tsx). `null` means no gate is needed (nothing hidden is
 * on screen right now): ROUND_RESOLVED/FINISHED show only public totals.
 */
export function expectedViewerId(state: GwentState): PlayerId | null {
  if (state.phase === 'MULLIGAN') return state.players.find((p) => !p.mulliganConfirmed)?.id ?? null;
  if (state.phase === 'AWAITING_START_CHOICE' || state.phase === 'ROUND_IN_PROGRESS') return getCurrentPlayer(state).id;
  return null;
}
