import type { RamsesAction } from './actions';
import {
  activePlayerCount,
  canForfeit,
  canNameGiftTarget,
  canNamePokerChallenge,
  canNameRiskTreasures,
  canSlidePyramid,
  computeWinnerIds,
  effectiveTreasureId,
  nextActivePlayerIndexAfter,
  nextPlayerIndex,
  playerIndexOf,
} from './rules';
import { getCurrentSearchTarget } from './selectors';
import type {
  PendingSpecialEffect,
  PlayerId,
  RamsesLogEntry,
  RamsesState,
  SpecialCard,
  TreasureCard,
} from './state';

function moveEmptyCellTo(state: RamsesState, fromCellId: string): RamsesState {
  const board = state.board.map((cell) => {
    if (cell.id === fromCellId) return { ...cell, hasPyramid: false };
    if (cell.id === state.emptyCellId) return { ...cell, hasPyramid: true };
    return cell;
  });
  return { ...state, board, emptyCellId: fromCellId };
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function lowestPointCard(cards: readonly TreasureCard[]): TreasureCard {
  return cards.reduce((a, b) => (b.points < a.points ? b : a));
}

/** Moves an EXISTING won card from one player to another — used by every special card's own card transfer (never the draw-pile award, see awardActiveCardToCurrentPlayer). */
function transferCard(state: RamsesState, fromPlayerId: PlayerId, toPlayerId: PlayerId, card: TreasureCard): RamsesState {
  return {
    ...state,
    players: state.players.map((player) => {
      if (player.id === fromPlayerId) return { ...player, wonCards: player.wonCards.filter((c) => c.id !== card.id) };
      if (player.id === toPlayerId) return { ...player, wonCards: [...player.wonCards, card] };
      return player;
    }),
  };
}

/** Adds a card that's already been pulled out of everyone's hands (Fata Morgana's tentatively-borrowed card) — no "from" side to remove it from. */
function addCardTo(state: RamsesState, playerId: PlayerId, card: TreasureCard): RamsesState {
  return {
    ...state,
    players: state.players.map((player) => (player.id === playerId ? { ...player, wonCards: [...player.wonCards, card] } : player)),
  };
}

/** Every OTHER player holding a won card of `treasureId` gives their LOWEST point-value one to `holderId` — Ajándék siker, docs/ramses-0a-specifikacio.md §8.2/2.5. */
function giveMatchingCardsToHolder(state: RamsesState, treasureId: string, holderId: PlayerId): RamsesState {
  let next = state;
  for (const player of state.players) {
    if (player.id === holderId) continue;
    const matching = player.wonCards.filter((c) => c.treasureId === treasureId);
    if (matching.length === 0) continue;
    next = transferCard(next, player.id, holderId, lowestPointCard(matching));
  }
  return next;
}

/**
 * One entry per applySlidePyramid CALL, i.e. per real SLIDE_PYRAMID action —
 * NOT per lucky-draw auto-match cascade inside drawCardForCurrentPlayer,
 * which is automatic bookkeeping within the same action's resolution, not a
 * separate player decision (see docs/shell-ux-specifikacio.md §4.2.1). Logged
 * uniformly regardless of turnPhase — during a special card's own slide-chain,
 * `matched` reflects whether this reveal hit THAT card's own current target,
 * not activeCard (which stays whatever it was, usually null, throughout).
 */
function appendSlideLog(
  prev: RamsesState,
  next: RamsesState,
  fromCellId: string,
  revealed: string | null,
  matched: boolean,
  pointsAwarded: number,
): RamsesState {
  const entry: RamsesLogEntry = {
    playerId: prev.players[prev.currentPlayerIndex].id,
    fromCellId,
    toCellId: prev.emptyCellId,
    treasureRevealed: revealed,
    matched,
    pointsAwarded,
  };
  return { ...next, log: [...next.log, entry] };
}

/**
 * Awards the current `activeCard` to the current player (caller's
 * responsibility to ensure one is actually set — only ever true during
 * SEARCHING, see state.ts's `activeCard` doc comment) and ends the game if
 * that was the last card in the draw pile.
 */
export function awardActiveCardToCurrentPlayer(state: RamsesState): RamsesState {
  const card = state.activeCard as TreasureCard;
  const players = state.players.map((player, index) =>
    index === state.currentPlayerIndex ? { ...player, wonCards: [...player.wonCards, card] } : player,
  );
  const next: RamsesState = { ...state, players, activeCard: null };

  if (next.drawPile.length === 0) {
    return { ...next, status: 'FINISHED', winnerIds: computeWinnerIds(next.players) };
  }
  return next;
}

/** Ends drawerId's turn and hands off to whoever comes after them — the shared "next" every special card resolves to (2.5/6, and 2.5/1 for Ajándék specifically: the DRAWER's next, never the finder's), then draws for that new current player. */
function closeSpecialEffectAndAdvance(state: RamsesState, drawerId: PlayerId): RamsesState {
  const nextIndex = nextActivePlayerIndexAfter(state, drawerId);
  const cleared: RamsesState = {
    ...state,
    turnPhase: 'SEARCHING',
    pendingSpecialEffect: null,
    currentPlayerIndex: nextIndex,
  };
  return drawCardForCurrentPlayer(cleared);
}

function resolveSearchingReveal(next: RamsesState, revealed: string | null): RamsesState {
  if (revealed === null) return next;
  if (revealed === next.activeCard!.treasureId) {
    const awarded = awardActiveCardToCurrentPlayer(next);
    return awarded.status === 'FINISHED' ? awarded : drawCardForCurrentPlayer(awarded);
  }
  return { ...next, currentPlayerIndex: nextPlayerIndex(next) };
}

function resolveGiftReveal(next: RamsesState, revealed: string | null): RamsesState {
  const effect = next.pendingSpecialEffect as Extract<PendingSpecialEffect, { type: 'GIFT' }>;
  if (revealed === null) return next;
  if (revealed === effect.targetTreasureId) {
    const withGift = giveMatchingCardsToHolder(next, effect.targetTreasureId, effect.holderId);
    return closeSpecialEffectAndAdvance(withGift, effect.drawerId);
  }
  // Wrong treasure — the card (and the decision) passes to the next player, see docs/ramses-0a-specifikacio.md §8.2.
  const nextHolderIndex = nextActivePlayerIndexAfter(next, effect.holderId);
  return {
    ...next,
    turnPhase: 'AWAITING_GIFT_TARGET',
    pendingSpecialEffect: { ...effect, holderId: next.players[nextHolderIndex].id, targetTreasureId: null },
    currentPlayerIndex: nextHolderIndex,
  };
}

function resolveRiskReveal(next: RamsesState, revealed: string | null): RamsesState {
  const effect = next.pendingSpecialEffect as Extract<PendingSpecialEffect, { type: 'RISK' }>;
  if (revealed === null) return next;

  const [first, second] = effect.treasureIds;
  const remainingTarget = effect.firstFound ? second : first;
  const leftNeighborIndex = (playerIndexOf(next, effect.drawerId) - 1 + next.players.length) % next.players.length;
  const leftNeighbor = next.players[leftNeighborIndex];
  const drawer = next.players[playerIndexOf(next, effect.drawerId)];

  if (revealed === remainingTarget) {
    if (!effect.firstFound) return { ...next, pendingSpecialEffect: { ...effect, firstFound: true } };
    // Both found — SUCCESS: a blind draw from the left neighbor.
    const withTransfer =
      leftNeighbor.wonCards.length > 0 ? transferCard(next, leftNeighbor.id, effect.drawerId, pickRandom(leftNeighbor.wonCards)) : next;
    return closeSpecialEffectAndAdvance(withTransfer, effect.drawerId);
  }

  // A third, unrelated treasure — FAILURE. "a drawer által kiválasztott lapot"
  // simplified to the drawer's own lowest-point card (same convention as
  // Ajándék's giving rule) rather than adding a dedicated card-choice
  // action/turnPhase for this one spot — see docs/ramses-0a-specifikacio.md §8.2.
  const withTransfer =
    drawer.wonCards.length > 0 ? transferCard(next, effect.drawerId, leftNeighbor.id, lowestPointCard(drawer.wonCards)) : next;
  return closeSpecialEffectAndAdvance(withTransfer, effect.drawerId);
}

function resolvePokerReveal(next: RamsesState, revealed: string | null): RamsesState {
  const effect = next.pendingSpecialEffect as Extract<PendingSpecialEffect, { type: 'POKER' }>;
  if (revealed === null) return next;

  const drawer = next.players[playerIndexOf(next, effect.drawerId)];
  const searcher = next.players[playerIndexOf(next, effect.searcherId)];

  if (revealed === effect.treasureId) {
    // SUCCESS — the searcher draws BLIND from the drawer (2026-07-30: confirmed blind, same mechanic as Kockázat).
    const withTransfer = drawer.wonCards.length > 0 ? transferCard(next, effect.drawerId, effect.searcherId, pickRandom(drawer.wonCards)) : next;
    return closeSpecialEffectAndAdvance(withTransfer, effect.drawerId);
  }
  // FAILURE — the drawer draws BLIND from the searcher.
  const withTransfer = searcher.wonCards.length > 0 ? transferCard(next, effect.searcherId, effect.drawerId, pickRandom(searcher.wonCards)) : next;
  return closeSpecialEffectAndAdvance(withTransfer, effect.drawerId);
}

function resolveFataMorganaReveal(next: RamsesState, revealed: string | null): RamsesState {
  const effect = next.pendingSpecialEffect as Extract<PendingSpecialEffect, { type: 'FATA_MORGANA' }>;
  if (revealed === null) return next;
  if (revealed === effect.card.treasureId) {
    return closeSpecialEffectAndAdvance(addCardTo(next, effect.drawerId, effect.card), effect.drawerId);
  }
  // Failure — the exact borrowed card returns to the neighbor (2026-07-30: confirmed, not an extra penalty).
  return closeSpecialEffectAndAdvance(addCardTo(next, effect.neighborId, effect.card), effect.drawerId);
}

function applySlidePyramid(state: RamsesState, fromCellId: string): RamsesState {
  if (!canSlidePyramid(state, fromCellId)) return state;

  const moved = moveEmptyCellTo(state, fromCellId);
  const revealed = effectiveTreasureId(moved, moved.emptyCellId);
  const target = getCurrentSearchTarget(state);
  const matched = revealed !== null && revealed === target;
  const pointsAwarded = matched && state.turnPhase === 'SEARCHING' ? state.activeCard!.points : 0;
  const logged = appendSlideLog(state, moved, fromCellId, revealed, matched, pointsAwarded);

  switch (logged.turnPhase) {
    case 'SEARCHING':
      return resolveSearchingReveal(logged, revealed);
    case 'AWAITING_GIFT_SLIDE':
      return resolveGiftReveal(logged, revealed);
    case 'AWAITING_RISK_SLIDE':
      return resolveRiskReveal(logged, revealed);
    case 'AWAITING_POKER_SLIDE':
      return resolvePokerReveal(logged, revealed);
    case 'AWAITING_FATA_MORGANA_SLIDE':
      return resolveFataMorganaReveal(logged, revealed);
    default:
      return logged; // unreachable — canSlidePyramid already gates out every other phase
  }
}

/**
 * Every special card resolves at the SAME trigger point normal treasure
 * draws do — see docs/ramses-0a-specifikacio.md §8.2's "Közös elv". All but
 * Fata Morgana (see its own case) immediately close the drawer's turn as a
 * side effect of being drawn — the card's own effect then plays out "within"
 * the next turn, even when it temporarily borrows another player's move
 * (Sivatagi póker) or passes through several players (Ajándék).
 */
function resolveSpecialCard(state: RamsesState, card: SpecialCard): RamsesState {
  const drawerId = state.players[state.currentPlayerIndex].id;
  switch (card.specialType) {
    case 'SANDSTORM': {
      // Toggling twice returns to the original orientation — exactly matches
      // rotating a physical layer 180° a second time.
      const rotated: RamsesState = { ...state, treasureLayerRotated: !state.treasureLayerRotated };
      return closeSpecialEffectAndAdvance(rotated, drawerId);
    }
    case 'FINISH':
      return { ...state, status: 'FINISHED', winnerIds: computeWinnerIds(state.players) };
    case 'GIFT':
      // At most ONE treasure is ever "revealed" at a time (state.emptyCellId's
      // own — see isTreasureRevealed's doc comment), so at least 11 of the 12
      // are always still hidden here — naming always has a valid target.
      return {
        ...state,
        turnPhase: 'AWAITING_GIFT_TARGET',
        pendingSpecialEffect: { type: 'GIFT', drawerId, holderId: drawerId, targetTreasureId: null },
      };
    case 'RISK':
      return {
        ...state,
        turnPhase: 'AWAITING_RISK_NAMING',
        // treasureIds filled in for real by NAME_RISK_TREASURES — this phase
        // only ever asks the player to name them, never reads them early.
        pendingSpecialEffect: { type: 'RISK', drawerId, treasureIds: ['', ''], firstFound: false },
      };
    case 'POKER':
      return {
        ...state,
        turnPhase: 'AWAITING_POKER_NAMING',
        pendingSpecialEffect: { type: 'POKER', drawerId, searcherId: drawerId, treasureId: null },
      };
    case 'FATA_MORGANA': {
      const neighborIndex = (state.currentPlayerIndex + 1) % state.players.length;
      const neighbor = state.players[neighborIndex];
      // Explicit exception in the card's own text: no card to borrow means
      // this draw is simply discarded, the drawer's turn is NOT closed, and
      // the next card is drawn immediately instead (2.5 Fata Morgana).
      if (neighbor.wonCards.length === 0) return drawCardForCurrentPlayer(state);

      const borrowed = pickRandom(neighbor.wonCards);
      const withoutBorrowed: RamsesState = {
        ...state,
        players: state.players.map((player, index) =>
          index === neighborIndex ? { ...player, wonCards: player.wonCards.filter((c) => c.id !== borrowed.id) } : player,
        ),
      };
      return {
        ...withoutBorrowed,
        turnPhase: 'AWAITING_FATA_MORGANA_SLIDE',
        pendingSpecialEffect: { type: 'FATA_MORGANA', drawerId, neighborId: neighbor.id, card: borrowed },
      };
    }
    default:
      return state;
  }
}

/**
 * Draws the top of the pile for the CURRENT player. A TreasureCard becomes
 * the new `activeCard`, with the same "szerencsés eset" instant-match/chain
 * behavior as before (per the user's house rule, docs/ramses-0a-specifikacio.md
 * §2.3) — now checked via `effectiveTreasureId` so a prior Homokvihar rotation
 * is respected. A SpecialCard never becomes `activeCard` — it resolves via
 * `resolveSpecialCard` instead (docs/ramses-0a-specifikacio.md §8.2).
 */
export function drawCardForCurrentPlayer(state: RamsesState): RamsesState {
  const [card, ...rest] = state.drawPile;
  const withPile: RamsesState = { ...state, drawPile: rest };

  if (card.kind === 'special') return resolveSpecialCard(withPile, card);

  const next: RamsesState = { ...withPile, activeCard: card };
  const emptyEffective = effectiveTreasureId(next, next.emptyCellId);
  if (emptyEffective !== null && emptyEffective === card.treasureId) {
    const awarded = awardActiveCardToCurrentPlayer(next);
    return awarded.status === 'FINISHED' ? awarded : drawCardForCurrentPlayer(awarded);
  }
  return next;
}

function applyNameGiftTarget(state: RamsesState, treasureId: string): RamsesState {
  if (!canNameGiftTarget(state, treasureId)) return state;
  const effect = state.pendingSpecialEffect as Extract<PendingSpecialEffect, { type: 'GIFT' }>;
  return {
    ...state,
    turnPhase: 'AWAITING_GIFT_SLIDE',
    pendingSpecialEffect: { ...effect, targetTreasureId: treasureId },
  };
}

function applyNameRiskTreasures(state: RamsesState, treasureIds: [string, string]): RamsesState {
  if (!canNameRiskTreasures(state, treasureIds)) return state;
  const effect = state.pendingSpecialEffect as Extract<PendingSpecialEffect, { type: 'RISK' }>;
  return {
    ...state,
    turnPhase: 'AWAITING_RISK_SLIDE',
    pendingSpecialEffect: { ...effect, treasureIds, firstFound: false },
  };
}

function applyNamePokerChallenge(state: RamsesState, treasureId: string, targetPlayerId: PlayerId): RamsesState {
  if (!canNamePokerChallenge(state, treasureId, targetPlayerId)) return state;
  const effect = state.pendingSpecialEffect as Extract<PendingSpecialEffect, { type: 'POKER' }>;
  return {
    ...state,
    turnPhase: 'AWAITING_POKER_SLIDE',
    pendingSpecialEffect: { ...effect, searcherId: targetPlayerId, treasureId },
    // Temporarily borrows the turn — reverted by closeSpecialEffectAndAdvance
    // once the searcher's slide resolves (2.5/4. válasz).
    currentPlayerIndex: playerIndexOf(state, targetPlayerId),
  };
}

/**
 * Gives up the CURRENT player's own turn for the rest of the game — real
 * playtest report (2026-07-30): "Szeretném, ha a Ramses-ben lenne egy
 * feladás gomb." Only ever the current player (see rules.ts's canForfeit,
 * SEARCHING-only), so there's never a pendingSpecialEffect naming/controlling
 * them to unwind. Doesn't touch activeCard — the search for it simply
 * continues with the next ACTIVE player, same as a wrong-treasure reveal
 * (resolveSearchingReveal). Mirrors Hotel's own applyForfeit/checkWinCondition
 * pair (reducer.ts there), just without a "send lots to the bank" equivalent
 * — Ramses has no bank, so a forfeited player simply keeps whatever they'd
 * already won (still ineligible to WIN, see computeWinnerIds).
 */
function applyForfeit(state: RamsesState): RamsesState {
  if (!canForfeit(state)) return state;
  const player = state.players[state.currentPlayerIndex];
  const forfeited: RamsesState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? { ...p, forfeited: true } : p)),
  };
  if (activePlayerCount(forfeited) <= 1) {
    return { ...forfeited, status: 'FINISHED', winnerIds: computeWinnerIds(forfeited.players) };
  }
  return { ...forfeited, currentPlayerIndex: nextActivePlayerIndexAfter(forfeited, player.id) };
}

export function reducer(state: RamsesState, action: RamsesAction): RamsesState {
  if (state.status !== 'IN_PROGRESS') return state;
  switch (action.type) {
    case 'SLIDE_PYRAMID':
      return applySlidePyramid(state, action.fromCellId);
    case 'NAME_GIFT_TARGET':
      return applyNameGiftTarget(state, action.treasureId);
    case 'NAME_RISK_TREASURES':
      return applyNameRiskTreasures(state, action.treasureIds);
    case 'NAME_POKER_CHALLENGE':
      return applyNamePokerChallenge(state, action.treasureId, action.targetPlayerId);
    case 'FORFEIT':
      return applyForfeit(state);
    default:
      return state;
  }
}
