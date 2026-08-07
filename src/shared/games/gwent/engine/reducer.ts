import { getCardDef } from './cardDefs';
import type { CardDef, Row } from './types';
import type { CardInstance, GwentLogEntry, GwentState, PlayerId, PlayerState } from './state';
import type { GwentAction } from './actions';
import { agileAutoOptimizes, medicPicksRandomTarget } from './leaderPassives';
import { applyLeaderAbility, canActivateLeaderAbility } from './leaderAbilities';
import { DANDELION_CARD_ID } from './specialCardIds';
import { shuffle } from '../../../core/shuffle';
import {
  ROWS,
  appendLog,
  applyWeatherEffect,
  canChooseStartingPlayer,
  canConfirmMulligan,
  canContinueAfterRound,
  canFlipStartingCoin,
  canMulliganSwap,
  canPass,
  canPlayCard,
  computeCardPower,
  computeRowTotal,
  destroyStrongestAcross,
  findCardOnPlayerBoard,
  findMusterPartnerDefIds,
  getOpponent,
  getPlayer,
  nextTurnPlayerIndex,
  pickMedicTarget,
  placeCardOnRow,
  removeCardFromRow,
  resolveRoundOutcome,
  scoiaTaelDecisivePlayerId,
  updateBoardRow,
  updatePlayer,
  type RowTarget,
} from './rules';

export function reducer(state: GwentState, action: GwentAction): GwentState {
  switch (action.type) {
    case 'MULLIGAN_SWAP':
      return applyMulliganSwap(state, action.playerId, action.instanceId);
    case 'CONFIRM_MULLIGAN':
      return applyConfirmMulligan(state, action.playerId);
    case 'FLIP_STARTING_COIN':
      return applyFlipStartingCoin(state);
    case 'CHOOSE_STARTING_PLAYER':
      return applyChooseStartingPlayer(state, action.playerId, action.chosenPlayerId);
    case 'PLAY_CARD':
      return applyPlayCard(state, action);
    case 'PASS':
      return applyPass(state, action.playerId);
    case 'ACTIVATE_LEADER_ABILITY':
      return applyActivateLeaderAbility(state, action);
    case 'CONTINUE_AFTER_ROUND':
      return applyContinueAfterRound(state);
    default:
      return state;
  }
}

// --- Mulligan ---

function applyMulliganSwap(state: GwentState, playerId: PlayerId, instanceId: string): GwentState {
  if (!canMulliganSwap(state, playerId, instanceId)) return state;
  const player = getPlayer(state, playerId);
  const card = player.hand.find((c) => c.instanceId === instanceId);
  const [drawn, ...restDeck] = player.deck;
  if (!card || !drawn) return state;
  const next = updatePlayer(state, playerId, {
    hand: [...player.hand.filter((c) => c.instanceId !== instanceId), drawn],
    deck: restDeck,
    mulliganSetAside: [...player.mulliganSetAside, card],
    mulligansLeft: player.mulligansLeft - 1,
  });
  return appendLog(next, { type: 'MULLIGAN_SWAPPED', playerId });
}

function applyConfirmMulligan(state: GwentState, playerId: PlayerId): GwentState {
  if (!canConfirmMulligan(state, playerId)) return state;
  const player = getPlayer(state, playerId);
  let next = updatePlayer(state, playerId, {
    mulliganConfirmed: true,
    // Swapped-out cards only rejoin the draw pool now — see state.ts PlayerState.mulliganSetAside.
    deck: shuffle([...player.deck, ...player.mulliganSetAside]),
    mulliganSetAside: [],
  });
  next = appendLog(next, { type: 'MULLIGAN_CONFIRMED', playerId });
  if (next.players.every((p) => p.mulliganConfirmed)) {
    next = { ...next, phase: 'AWAITING_START_CHOICE' };
  }
  return next;
}

// --- Starting player (round 1 coin flip, or every round's Scoia'tael choice) ---

function applyFlipStartingCoin(state: GwentState): GwentState {
  if (!canFlipStartingCoin(state)) return state;
  const result: 'castle' | 'torch' = Math.random() < 0.5 ? 'castle' : 'torch';
  const startingPlayerId = result === 'castle' ? state.players[0].id : state.players[1].id;
  const startingIndex = state.players.findIndex((p) => p.id === startingPlayerId);
  const next = appendLog(state, { type: 'STARTING_COIN_FLIP', result, startingPlayerId });
  return { ...next, phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: startingIndex };
}

function applyChooseStartingPlayer(state: GwentState, playerId: PlayerId, chosenPlayerId: PlayerId): GwentState {
  if (!canChooseStartingPlayer(state, playerId)) return state;
  if (!state.players.some((p) => p.id === chosenPlayerId)) return state;
  const startingIndex = state.players.findIndex((p) => p.id === chosenPlayerId);
  const next = appendLog(state, { type: 'STARTING_PLAYER_CHOSEN', chooserId: playerId, startingPlayerId: chosenPlayerId });
  return { ...next, phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: startingIndex };
}

// --- Playing a card ---

function resolvePlacementRow(state: GwentState, playerId: PlayerId, instance: CardInstance, def: CardDef, chosenRow: Row | undefined): Row {
  if (def.row) return def.row;
  if (agileAutoOptimizes(state, playerId)) {
    const meleePower = computeCardPower(state, playerId, 'Melee', instance);
    const rangedPower = computeCardPower(state, playerId, 'Ranged', instance);
    return rangedPower > meleePower ? 'Ranged' : 'Melee';
  }
  return chosenRow ?? 'Melee'; // canPlayCard already guarantees chosenRow is Melee/Ranged here unless auto-optimized
}

function resolveMusterChain(state: GwentState, playerId: PlayerId, triggerDefId: string, triggerInstanceId: string): GwentState {
  const triggerDef = getCardDef(triggerDefId);
  if (!triggerDef.abilities.includes('Muster')) return state;
  const partnerDefIds = findMusterPartnerDefIds(triggerDefId);
  const player = getPlayer(state, playerId);
  const partners = [
    ...player.hand.filter((c) => partnerDefIds.includes(c.defId)),
    ...player.deck.filter((c) => partnerDefIds.includes(c.defId)),
  ];
  if (partners.length === 0) return state;

  let next = updatePlayer(state, playerId, {
    hand: player.hand.filter((c) => !partnerDefIds.includes(c.defId)),
    deck: player.deck.filter((c) => !partnerDefIds.includes(c.defId)),
  });
  const playedInstanceIds: string[] = [];
  for (const partner of partners) {
    const partnerDef = getCardDef(partner.defId);
    const row = partnerDef.row ?? 'Melee'; // no Muster card in the dataset is Agile — safe, documented fallback
    next = placeCardOnRow(next, playerId, row, partner);
    next = appendLog(next, { type: 'CARD_PLAYED', playerId, instanceId: partner.instanceId, defId: partner.defId, row, ownerRowPlayerId: playerId });
    playedInstanceIds.push(partner.instanceId);
  }
  return appendLog(next, { type: 'MUSTER_TRIGGERED', playerId, triggerInstanceId, playedInstanceIds });
}

/**
 * `requestedInstanceIds` is an ORDERED chain, not a single id (Gwent-0c.4
 * §11: "ugyanígy... a medik képességre is" — a revived Medic-ability card's
 * OWN Medic ability should also get a real, player-picked target, not just
 * silently fizzle). Element 0 is this level's pick; the rest are handed down
 * for a nested revival if the revived card itself has Medic — MatchBoard.tsx
 * collects the whole chain client-side (reusing the SAME picker UI level by
 * level, no new UI) before dispatching one PLAY_CARD. `resolvePlayEffects`
 * (below) is what actually re-invokes this recursively.
 */
function resolveMedic(state: GwentState, playerId: PlayerId, requestedInstanceIds: string[] | undefined): GwentState {
  const wasRandom = medicPicksRandomTarget(state);
  const [requestedInstanceId, ...restRequested] = requestedInstanceIds ?? [];
  const target = pickMedicTarget(state, playerId, requestedInstanceId);
  if (!target) return state;
  const player = getPlayer(state, playerId);
  let next = updatePlayer(state, playerId, { discard: player.discard.filter((c) => c.instanceId !== target.instanceId) });
  next = appendLog(next, { type: 'MEDIC_REVIVED', playerId, instanceId: target.instanceId, defId: target.defId, wasRandom });
  // Re-runs the FULL on-play pipeline for the revived card — Spy redirection+draw,
  // Muster chain (hand/deck ONLY, never discard — see findMusterPartnerDefIds/
  // resolveMusterChain, unchanged), row-scorch, AND (via the recursion back into
  // resolveMedic below, if the revived card is itself Medic) a nested pick,
  // exactly as if it had just been played from hand.
  return resolvePlayEffects(next, playerId, target, undefined, restRequested.length > 0 ? restRequested : undefined);
}

function resolveRowScorchIfAny(state: GwentState, playerId: PlayerId, def: CardDef): GwentState {
  if (!def.rowScorch) return state;
  const opponent = getOpponent(state, playerId);
  if (computeRowTotal(state, opponent.id, def.rowScorch.targetRow) < def.rowScorch.threshold) return state;
  const result = destroyStrongestAcross(state, [{ playerId: opponent.id, row: def.rowScorch.targetRow }]);
  let next = appendLog(result.state, {
    type: 'ROW_SCORCH_RESOLVED',
    playerId,
    row: def.rowScorch.targetRow,
    destroyedInstanceIds: result.destroyedInstanceIds,
  });
  for (const replacement of result.cowReplacements) {
    next = appendLog(next, { type: 'COW_REPLACED', playerId: replacement.playerId, row: replacement.row, newInstanceId: replacement.newInstanceId });
  }
  return next;
}

/**
 * Places a card on the board and resolves every on-play trigger — Spy
 * redirection+draw, Muster chain, an optional Medic sub-step, row-scorch.
 * Called both for a normal PLAY_CARD from hand AND (Gwent-0c.4 §11)
 * recursively from `resolveMedic` for a just-revived card, so a Medic'd-back
 * Spy/Muster/Medic card behaves exactly as if it had been freshly played —
 * no separate, cut-down path for revivals anymore.
 */
function resolvePlayEffects(
  state: GwentState,
  playerId: PlayerId,
  instance: CardInstance,
  chosenRow: Row | undefined,
  medicReviveInstanceIds: string[] | undefined,
): GwentState {
  const def = getCardDef(instance.defId);
  const isSpy = def.abilities.includes('Spy');
  const boardOwnerId = isSpy ? getOpponent(state, playerId).id : playerId;
  const row = resolvePlacementRow(state, playerId, instance, def, chosenRow);

  let next = placeCardOnRow(state, boardOwnerId, row, instance);
  next = appendLog(
    next,
    isSpy
      ? { type: 'CARD_MOVED_TO_OPPONENT', playerId, instanceId: instance.instanceId, defId: instance.defId, row }
      : { type: 'CARD_PLAYED', playerId, instanceId: instance.instanceId, defId: instance.defId, row, ownerRowPlayerId: boardOwnerId },
  );

  if (isSpy) {
    const player = getPlayer(next, playerId);
    const drawn = player.deck.slice(0, 2);
    if (drawn.length > 0) {
      next = updatePlayer(next, playerId, { hand: [...player.hand, ...drawn], deck: player.deck.slice(drawn.length) });
      next = appendLog(next, { type: 'CARDS_DRAWN', playerId, count: drawn.length, reason: 'SPY' });
    }
  }

  next = resolveMusterChain(next, playerId, instance.defId, instance.instanceId);
  if (def.abilities.includes('Medic')) next = resolveMedic(next, playerId, medicReviveInstanceIds);
  next = resolveRowScorchIfAny(next, playerId, def);

  return next;
}

function resolveDecoy(state: GwentState, playerId: PlayerId, decoyInstance: CardInstance, targetInstanceId: string): GwentState {
  const player = getPlayer(state, playerId);
  const found = findCardOnPlayerBoard(player, targetInstanceId);
  if (!found) return state;
  const removal = removeCardFromRow(state, playerId, found.row, targetInstanceId);
  if (!removal.card) return state;
  const afterRemoval = getPlayer(removal.state, playerId);
  const next = updatePlayer(removal.state, playerId, {
    hand: [...afterRemoval.hand, removal.card],
    discard: [...afterRemoval.discard, decoyInstance],
  });
  return appendLog(next, {
    type: 'DECOY_SWAPPED',
    playerId,
    decoyInstanceId: decoyInstance.instanceId,
    returnedInstanceId: removal.card.instanceId,
    returnedDefId: removal.card.defId,
  });
}

function applyPlayCard(state: GwentState, action: Extract<GwentAction, { type: 'PLAY_CARD' }>): GwentState {
  const { playerId, instanceId, chosenRow, decoyTargetInstanceId, medicReviveInstanceIds } = action;
  if (!canPlayCard(state, playerId, instanceId, chosenRow, decoyTargetInstanceId, medicReviveInstanceIds)) return state;

  const player = getPlayer(state, playerId);
  const instance = player.hand.find((c) => c.instanceId === instanceId);
  if (!instance) return state;
  const def = getCardDef(instance.defId);

  let next = updatePlayer(state, playerId, { hand: player.hand.filter((c) => c.instanceId !== instanceId) });

  if (def.kind === 'Unit') {
    next = resolvePlayEffects(next, playerId, instance, chosenRow, medicReviveInstanceIds);
  } else if (def.kind === 'Decoy') {
    next = resolveDecoy(next, playerId, instance, decoyTargetInstanceId as string);
  } else if (def.kind === 'Horn') {
    // Gwent-0c.4 §K: the Horn card itself now stays visible on the row
    // (BoardRow.tsx pins it right after the horn-icon column) instead of
    // going straight to discard — `hornActive` still drives the actual x2
    // power effect (computeCardPower), the card sitting in `cards` is purely
    // visual (basePower: null -> always contributes 0, see computeCardPower's
    // early return). A 2nd Horn played on an already-active row just adds a
    // 2nd (still 0-power) tile — hornActive is idempotent, nothing stacks.
    next = updateBoardRow(next, playerId, chosenRow as Row, { hornActive: true });
    next = placeCardOnRow(next, playerId, chosenRow as Row, instance);
  } else if (def.kind === 'Scorch') {
    const targets: RowTarget[] = next.players.flatMap((p) => ROWS.map((row) => ({ playerId: p.id, row })));
    const result = destroyStrongestAcross(next, targets);
    next = appendLog(result.state, { type: 'SCORCH_RESOLVED', playerId, destroyedInstanceIds: result.destroyedInstanceIds });
    for (const replacement of result.cowReplacements) {
      next = appendLog(next, { type: 'COW_REPLACED', playerId: replacement.playerId, row: replacement.row, newInstanceId: replacement.newInstanceId });
    }
    next = updatePlayer(next, playerId, { discard: [...getPlayer(next, playerId).discard, instance] });
  } else if (def.kind === 'Weather') {
    const weatherRow = def.weatherRow ?? 'AllRows';
    next = applyWeatherEffect(next, weatherRow);
    next = appendLog(next, weatherRow === 'AllRows' ? { type: 'WEATHER_CLEARED', playerId } : { type: 'WEATHER_APPLIED', playerId, row: weatherRow });
    next = updatePlayer(next, playerId, { discard: [...getPlayer(next, playerId).discard, instance] });
  }

  return advanceTurnUnlessRoundOver(next, playerId);
}

// --- Pass / round resolution ---

/**
 * Shared by PLAY_CARD/ACTIVATE_LEADER_ABILITY (never by PASS — passing can
 * end the round, handled separately in applyPass/resolveRound). Advances to
 * the opponent unless they've already passed, in which case the acting
 * player keeps taking turns alone for the rest of the round.
 */
function advanceTurnUnlessRoundOver(state: GwentState, actingPlayerId: PlayerId): GwentState {
  return { ...state, currentPlayerIndex: nextTurnPlayerIndex(state, actingPlayerId) };
}

function applyPass(state: GwentState, playerId: PlayerId): GwentState {
  if (!canPass(state, playerId)) return state;
  let next = updatePlayer(state, playerId, { passed: true });
  next = appendLog(next, { type: 'PASSED', playerId });
  const opponent = getOpponent(next, playerId);
  if (opponent.passed) return resolveRound(next);
  return { ...next, currentPlayerIndex: nextTurnPlayerIndex(next, playerId) };
}

function clearBoardsWithMonstersBonus(state: GwentState): GwentState {
  let next = state;
  for (const player of state.players) {
    const allCards = ROWS.flatMap((row) => player.board[row].cards.map((card) => ({ row, card })));
    const survivor = player.faction === 'Monsters' && allCards.length > 0 ? allCards[Math.floor(Math.random() * allCards.length)] : null;
    const toDiscard = allCards.filter((entry) => entry !== survivor).map((entry) => entry.card);
    next = updatePlayer(next, player.id, { discard: [...getPlayer(next, player.id).discard, ...toDiscard] });
    for (const row of ROWS) {
      const keep = survivor && survivor.row === row ? [survivor.card] : [];
      next = updateBoardRow(next, player.id, row, { cards: keep, hornActive: false, dandelionActive: keep.some((c) => c.defId === DANDELION_CARD_ID) });
    }
  }
  return next;
}

function resolveRound(state: GwentState): GwentState {
  const outcome = resolveRoundOutcome(state);
  let next = state;
  const livesLost: PlayerId[] = [];

  if (outcome.tie) {
    livesLost.push(...next.players.map((p) => p.id));
    next = { ...next, players: next.players.map((p) => ({ ...p, lives: p.lives - 1 })) as [PlayerState, PlayerState] };
  } else if (outcome.winnerId) {
    const loser = getOpponent(next, outcome.winnerId);
    livesLost.push(loser.id);
    next = updatePlayer(next, loser.id, { lives: loser.lives - 1 });
    next = updatePlayer(next, outcome.winnerId, { roundsWon: getPlayer(next, outcome.winnerId).roundsWon + 1 });

    const winner = getPlayer(next, outcome.winnerId);
    if (winner.faction === 'NorthernRealms' && winner.deck.length > 0) {
      const [drawn, ...restDeck] = winner.deck;
      next = updatePlayer(next, winner.id, { hand: [...winner.hand, drawn], deck: restDeck });
      next = appendLog(next, { type: 'CARDS_DRAWN', playerId: winner.id, count: 1, reason: 'ROUND_WON_BONUS' });
    }
  }

  next = appendLog(next, { type: 'ROUND_RESOLVED', round: next.round, totals: outcome.totals, winnerId: outcome.winnerId, tie: outcome.tie, livesLost });
  next = clearBoardsWithMonstersBonus(next);
  return { ...next, phase: 'ROUND_RESOLVED' };
}

function lastRoundResolvedEntry(state: GwentState): Extract<GwentLogEntry, { type: 'ROUND_RESOLVED' }> {
  const entry = [...state.log].reverse().find((e): e is Extract<GwentLogEntry, { type: 'ROUND_RESOLVED' }> => e.type === 'ROUND_RESOLVED');
  if (!entry) throw new Error('applyContinueAfterRound called with no ROUND_RESOLVED log entry — reducer invariant violated');
  return entry;
}

function applyContinueAfterRound(state: GwentState): GwentState {
  if (!canContinueAfterRound(state)) return state;

  const eliminated = state.players.find((p) => p.lives <= 0);
  const twoRoundsWon = state.players.find((p) => p.roundsWon >= 2);
  if (eliminated || twoRoundsWon) {
    const winner = twoRoundsWon ?? getOpponent(state, eliminated!.id);
    return appendLog({ ...state, phase: 'FINISHED', winnerIds: [winner.id] }, { type: 'GAME_WON', winnerId: winner.id });
  }

  const roundOutcome = lastRoundResolvedEntry(state);
  const next: GwentState = {
    ...state,
    round: state.round + 1,
    players: state.players.map((p) => ({ ...p, passed: false })) as [PlayerState, PlayerState],
  };

  if (scoiaTaelDecisivePlayerId(next) !== null) return { ...next, phase: 'AWAITING_START_CHOICE' };

  // Deterministic default: the round's loser starts the next round. A true tie (both lost a life,
  // e.g. no Nilfgaard involved) has no single "loser" — falls back to player-1 (documented edge case,
  // the physical rulebook/spec doesn't cover it).
  const loserId = roundOutcome.winnerId ? getOpponent(next, roundOutcome.winnerId).id : next.players[0].id;
  return { ...next, phase: 'ROUND_IN_PROGRESS', currentPlayerIndex: next.players.findIndex((p) => p.id === loserId) };
}

// --- Leader ability ---

function applyActivateLeaderAbility(state: GwentState, action: Extract<GwentAction, { type: 'ACTIVATE_LEADER_ABILITY' }>): GwentState {
  const { playerId, targetInstanceId, secondaryInstanceIds } = action;
  if (!canActivateLeaderAbility(state, playerId)) return state;
  const next = applyLeaderAbility(state, playerId, targetInstanceId, secondaryInstanceIds);
  return advanceTurnUnlessRoundOver(next, playerId);
}
