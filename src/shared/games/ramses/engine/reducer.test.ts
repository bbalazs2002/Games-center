import { describe, expect, it } from 'vitest';
import { awardActiveCardToCurrentPlayer, drawCardForCurrentPlayer, reducer } from './reducer';
import { buildTestState, treasureCard, updateCell } from './testHelpers';

describe('reducer — SLIDE_PYRAMID', () => {
  it('is a no-op for a non-adjacent cell', () => {
    const state = buildTestState();
    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r5c7' });
    expect(next).toBe(state);
  });

  it('is a no-op once the game has finished', () => {
    const state = buildTestState({ status: 'FINISHED' });
    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c1' });
    expect(next).toBe(state);
  });

  it('revealing a blank cell moves the empty space and continues the same turn', () => {
    const state = buildTestState({ activeCard: treasureCard('c1', 'scarab', 3) });
    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c1' });

    expect(next.emptyCellId).toBe('r0c1');
    expect(next.board.find((c) => c.id === 'r0c0')?.hasPyramid).toBe(true);
    expect(next.board.find((c) => c.id === 'r0c1')?.hasPyramid).toBe(false);
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.activeCard).toEqual(treasureCard('c1', 'scarab', 3));
    expect(next.log).toEqual([
      { playerId: 'player-1', fromCellId: 'r0c1', toCellId: 'r0c0', treasureRevealed: null, matched: false, pointsAwarded: 0 },
    ]);
  });

  it('revealing the wrong treasure passes the turn — activeCard stays the same target', () => {
    let state = buildTestState({ activeCard: treasureCard('c1', 'scarab', 3) });
    state = updateCell(state, 'r0c1', { treasureId: 'ankh' });

    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c1' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.activeCard).toEqual(treasureCard('c1', 'scarab', 3));
    expect(next.players[0].wonCards).toEqual([]);
    expect(next.log).toEqual([
      { playerId: 'player-1', fromCellId: 'r0c1', toCellId: 'r0c0', treasureRevealed: 'ankh', matched: false, pointsAwarded: 0 },
    ]);
  });

  it('revealing the right treasure awards the card, the SAME player continues, and draws the next card', () => {
    let state = buildTestState({
      activeCard: treasureCard('c1', 'scarab', 3),
      drawPile: [treasureCard('c2', 'ankh', 1)],
    });
    state = updateCell(state, 'r0c1', { treasureId: 'scarab' });

    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c1' });
    expect(next.currentPlayerIndex).toBe(0); // NOT the next player — house rule, see docs/ramses-0a-specifikacio.md §2.3
    expect(next.players[0].wonCards).toEqual([treasureCard('c1', 'scarab', 3)]);
    expect(next.activeCard).toEqual(treasureCard('c2', 'ankh', 1));
    expect(next.drawPile).toEqual([]);
    expect(next.status).toBe('IN_PROGRESS');
    // Exactly one log entry for the real SLIDE_PYRAMID action — the automatic
    // follow-up draw (drawCardForCurrentPlayer) is bookkeeping, not a second action.
    expect(next.log).toEqual([
      { playerId: 'player-1', fromCellId: 'r0c1', toCellId: 'r0c0', treasureRevealed: 'scarab', matched: true, pointsAwarded: 3 },
    ]);
  });

  it('winning the last card in the pile finishes the game and computes a winner', () => {
    let state = buildTestState({ activeCard: treasureCard('c1', 'scarab', 3), drawPile: [] });
    state = updateCell(state, 'r0c1', { treasureId: 'scarab' });

    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c1' });
    expect(next.status).toBe('FINISHED');
    expect(next.winnerIds).toEqual(['player-1']);
    expect(next.activeCard).toBeNull();
  });

  it('a chain of blanks lets the same player keep sliding indefinitely', () => {
    const state = buildTestState({ activeCard: treasureCard('c1', 'scarab', 3) });
    // r0c0 (empty) -> slide r0c1 (blank) -> empty now r0c1 -> slide r0c2 (blank)
    const afterFirst = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c1' });
    const afterSecond = reducer(afterFirst, { type: 'SLIDE_PYRAMID', fromCellId: 'r0c2' });

    expect(afterSecond.emptyCellId).toBe('r0c2');
    expect(afterSecond.currentPlayerIndex).toBe(0);
    expect(afterSecond.activeCard).toEqual(treasureCard('c1', 'scarab', 3));
  });
});

describe('awardActiveCardToCurrentPlayer', () => {
  it('adds the card to the current player, clears activeCard', () => {
    let state = buildTestState({ activeCard: treasureCard('c1', 'scarab', 3), drawPile: [treasureCard('c2', 'ankh', 1)] });
    state = awardActiveCardToCurrentPlayer(state);
    expect(state.players[0].wonCards).toEqual([treasureCard('c1', 'scarab', 3)]);
    expect(state.activeCard).toBeNull();
    expect(state.status).toBe('IN_PROGRESS');
  });

  it('finishes the game and computes winners when the draw pile is now empty', () => {
    let state = buildTestState({ activeCard: treasureCard('c1', 'scarab', 3), drawPile: [] });
    state = awardActiveCardToCurrentPlayer(state);
    expect(state.status).toBe('FINISHED');
    expect(state.winnerIds).toEqual(['player-1']);
  });
});

describe('drawCardForCurrentPlayer', () => {
  it('draws the top card into activeCard when it does not match what is already showing', () => {
    const state = buildTestState({ drawPile: [treasureCard('c1', 'scarab', 2)] });
    // empty cell (r0c0) has treasureId null by default — never matches a real treasureId
    const next = drawCardForCurrentPlayer(state);
    expect(next.activeCard).toEqual(treasureCard('c1', 'scarab', 2));
    expect(next.drawPile).toEqual([]);
  });

  it('"lucky" case: auto-awards without a move when the new card matches what is already exposed', () => {
    let state = buildTestState({ drawPile: [treasureCard('c1', 'ankh', 2), treasureCard('c2', 'scarab', 1)] });
    state = updateCell(state, 'r0c0', { treasureId: 'ankh' }); // the currently-empty cell already shows "ankh"
    const next = drawCardForCurrentPlayer(state);
    // card c1 (ankh) matches immediately -> auto-won, then draws c2 next
    expect(next.players[0].wonCards).toEqual([treasureCard('c1', 'ankh', 2)]);
    expect(next.activeCard).toEqual(treasureCard('c2', 'scarab', 1));
    expect(next.drawPile).toEqual([]);
  });

  it('respects a Homokvihar rotation when checking the "lucky" instant-match', () => {
    let state = buildTestState({ treasureLayerRotated: true, drawPile: [treasureCard('c1', 'mummy', 2)] });
    // static treasureId 'mummy' lives at r5c7; once rotated, r0c0 (the empty cell) EFFECTIVELY shows it.
    state = updateCell(state, 'r5c7', { treasureId: 'mummy' });
    const next = drawCardForCurrentPlayer(state);
    expect(next.players[0].wonCards).toEqual([treasureCard('c1', 'mummy', 2)]);
  });
});

describe('drawCardForCurrentPlayer — Homokvihar (SANDSTORM)', () => {
  it('toggles treasureLayerRotated, closes the drawer\'s turn, and draws for the next player', () => {
    const state = buildTestState({
      drawPile: [
        { kind: 'special', id: 's1', specialType: 'SANDSTORM' },
        treasureCard('c1', 'mummy', 1),
      ],
    });
    const next = drawCardForCurrentPlayer(state);
    expect(next.treasureLayerRotated).toBe(true);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.turnPhase).toBe('SEARCHING');
    expect(next.activeCard).toEqual(treasureCard('c1', 'mummy', 1));
    expect(next.drawPile).toEqual([]);
  });

  it('a second Homokvihar flips treasureLayerRotated back to false', () => {
    const state = buildTestState({
      treasureLayerRotated: true,
      drawPile: [{ kind: 'special', id: 's1', specialType: 'SANDSTORM' }, treasureCard('c1', 'mummy', 1)],
    });
    const next = drawCardForCurrentPlayer(state);
    expect(next.treasureLayerRotated).toBe(false);
  });
});

describe('drawCardForCurrentPlayer — Záró kártya (FINISH)', () => {
  it('ends the game immediately, even with cards still left in the pile', () => {
    const state = buildTestState({
      drawPile: [{ kind: 'special', id: 'fin', specialType: 'FINISH' }, treasureCard('c1', 'mummy', 1)],
    });
    const next = drawCardForCurrentPlayer(state);
    expect(next.status).toBe('FINISHED');
    expect(next.drawPile).toEqual([treasureCard('c1', 'mummy', 1)]); // untouched — never drawn
    expect(next.winnerIds.sort()).toEqual(['player-1', 'player-2']); // both at 0 score -> tie
  });
});

describe('reducer — Ajándék (GIFT)', () => {
  it('full success flow: names a target, slides to it, and the lowest-point matching cards transfer to the holder; turn passes to the DRAWER\'s next player', () => {
    let state = buildTestState({
      players: [
        { id: 'player-1', name: 'Alice', wonCards: [] },
        { id: 'player-2', name: 'Bob', wonCards: [treasureCard('b1', 'mummy', 4), treasureCard('b2', 'mummy', 2)] },
      ],
      drawPile: [{ kind: 'special', id: 'g1', specialType: 'GIFT' }, treasureCard('c1', 'scarab', 1)],
    });
    state = updateCell(state, 'r1c0', { treasureId: 'mummy', hasPyramid: true });
    state = drawCardForCurrentPlayer(state);
    expect(state.turnPhase).toBe('AWAITING_GIFT_TARGET');
    expect(state.pendingSpecialEffect).toEqual({ type: 'GIFT', drawerId: 'player-1', holderId: 'player-1', targetTreasureId: null });

    state = reducer(state, { type: 'NAME_GIFT_TARGET', treasureId: 'mummy' });
    expect(state.turnPhase).toBe('AWAITING_GIFT_SLIDE');

    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r1c0' }); // r1c0 adjacent to r0c0 (empty)
    expect(next.players[0].wonCards).toEqual([treasureCard('b2', 'mummy', 2)]); // lowest point given
    expect(next.players[1].wonCards).toEqual([treasureCard('b1', 'mummy', 4)]); // kept the higher one
    expect(next.turnPhase).toBe('SEARCHING');
    expect(next.pendingSpecialEffect).toBeNull();
    expect(next.currentPlayerIndex).toBe(1); // player-1's next = player-2
    expect(next.activeCard).toEqual(treasureCard('c1', 'scarab', 1));
  });

  it('a wrong reveal passes the gift to the next player, who then names their own new target', () => {
    let state = buildTestState({
      turnPhase: 'AWAITING_GIFT_TARGET',
      pendingSpecialEffect: { type: 'GIFT', drawerId: 'player-1', holderId: 'player-1', targetTreasureId: null },
    });
    state = updateCell(state, 'r1c0', { treasureId: 'mummy', hasPyramid: true }); // the wrong reveal
    state = updateCell(state, 'r0c1', { treasureId: 'scarab', hasPyramid: true }); // the named target — different cell
    state = reducer(state, { type: 'NAME_GIFT_TARGET', treasureId: 'scarab' });
    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r1c0' }); // reveals mummy, not scarab

    expect(next.turnPhase).toBe('AWAITING_GIFT_TARGET');
    expect(next.currentPlayerIndex).toBe(1); // now player-2's decision
    expect(next.pendingSpecialEffect).toEqual({ type: 'GIFT', drawerId: 'player-1', holderId: 'player-2', targetTreasureId: null });
  });
});

describe('reducer — Kockázat (RISK)', () => {
  it('success: finds both named treasures in order, then blind-draws from the left neighbor', () => {
    let state = buildTestState({
      players: [
        { id: 'player-1', name: 'Alice', wonCards: [] },
        { id: 'player-2', name: 'Bob', wonCards: [treasureCard('b1', 'dog', 1)] }, // left neighbor of player-1 in a 2-player game
      ],
      turnPhase: 'AWAITING_RISK_NAMING',
      pendingSpecialEffect: { type: 'RISK', drawerId: 'player-1', treasureIds: ['', ''], firstFound: false },
      drawPile: [treasureCard('c1', 'scarab', 1)],
    });
    state = updateCell(state, 'r1c0', { treasureId: 'mummy', hasPyramid: true });
    state = updateCell(state, 'r2c0', { treasureId: 'ankh', hasPyramid: true });

    state = reducer(state, { type: 'NAME_RISK_TREASURES', treasureIds: ['mummy', 'ankh'] });
    expect(state.turnPhase).toBe('AWAITING_RISK_SLIDE');

    const afterFirst = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r1c0' }); // finds mummy (first)
    expect(afterFirst.pendingSpecialEffect).toMatchObject({ firstFound: true });
    expect(afterFirst.turnPhase).toBe('AWAITING_RISK_SLIDE');

    const afterSecond = reducer(afterFirst, { type: 'SLIDE_PYRAMID', fromCellId: 'r2c0' }); // finds ankh (second) — success
    expect(afterSecond.turnPhase).toBe('SEARCHING');
    expect(afterSecond.pendingSpecialEffect).toBeNull();
    expect(afterSecond.players[0].wonCards).toEqual([treasureCard('b1', 'dog', 1)]); // blind draw from the left neighbor
    expect(afterSecond.players[1].wonCards).toEqual([]);
    expect(afterSecond.currentPlayerIndex).toBe(1); // drawer's (player-1) own next = player-2
  });

  it('failure: a third, unrelated treasure surfaces — the drawer gives their own lowest-point card to the left neighbor', () => {
    let state = buildTestState({
      players: [
        { id: 'player-1', name: 'Alice', wonCards: [treasureCard('a1', 'sphinx', 4), treasureCard('a2', 'sphinx', 1)] },
        { id: 'player-2', name: 'Bob', wonCards: [] },
      ],
      turnPhase: 'AWAITING_RISK_SLIDE',
      pendingSpecialEffect: { type: 'RISK', drawerId: 'player-1', treasureIds: ['mummy', 'ankh'], firstFound: false },
      drawPile: [treasureCard('c1', 'scarab', 1)],
    });
    state = updateCell(state, 'r1c0', { treasureId: 'duck', hasPyramid: true }); // neither named target

    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r1c0' });
    expect(next.turnPhase).toBe('SEARCHING');
    expect(next.players[0].wonCards).toEqual([treasureCard('a1', 'sphinx', 4)]); // gave away the lowest-point one
    expect(next.players[1].wonCards).toEqual([treasureCard('a2', 'sphinx', 1)]);
    expect(next.currentPlayerIndex).toBe(1);
  });
});

describe('reducer — Sivatagi póker (POKER)', () => {
  it('success: temporarily borrows the named player\'s turn, then correctly reverts to the DRAWER\'s own next player afterward (not the searcher\'s)', () => {
    let state = buildTestState({
      players: [
        { id: 'player-1', name: 'Alice', wonCards: [treasureCard('a1', 'duck', 2)] },
        { id: 'player-2', name: 'Bob', wonCards: [] },
        { id: 'player-3', name: 'Cid', wonCards: [] },
      ],
      turnPhase: 'AWAITING_POKER_NAMING',
      pendingSpecialEffect: { type: 'POKER', drawerId: 'player-1', searcherId: 'player-1', treasureId: null },
      drawPile: [treasureCard('c1', 'scarab', 1)],
    });
    state = updateCell(state, 'r1c0', { treasureId: 'mummy', hasPyramid: true });

    state = reducer(state, { type: 'NAME_POKER_CHALLENGE', treasureId: 'mummy', targetPlayerId: 'player-3' });
    expect(state.turnPhase).toBe('AWAITING_POKER_SLIDE');
    expect(state.currentPlayerIndex).toBe(2); // player-3, temporarily

    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r1c0' });
    expect(next.players[2].wonCards).toEqual([treasureCard('a1', 'duck', 2)]); // searcher (player-3) took the drawer's card, blind
    expect(next.players[0].wonCards).toEqual([]);
    expect(next.currentPlayerIndex).toBe(1); // reverted: drawer (player-1)'s own next = player-2, NOT player-3's next
    expect(next.turnPhase).toBe('SEARCHING');
  });

  it('failure: the drawer draws blind from the searcher', () => {
    let state = buildTestState({
      players: [
        { id: 'player-1', name: 'Alice', wonCards: [] },
        { id: 'player-2', name: 'Bob', wonCards: [treasureCard('b1', 'duck', 2)] },
      ],
      turnPhase: 'AWAITING_POKER_SLIDE',
      pendingSpecialEffect: { type: 'POKER', drawerId: 'player-1', searcherId: 'player-2', treasureId: 'mummy' },
      currentPlayerIndex: 1,
      // A DIFFERENT treasureId than the wrong reveal below — otherwise the
      // next draw would coincidentally "luckily" match what's now showing at
      // the just-revealed cell, an unrelated cascade this test isn't about.
      drawPile: [treasureCard('c1', 'duck', 1)],
    });
    state = updateCell(state, 'r1c0', { treasureId: 'scarab', hasPyramid: true }); // wrong treasure

    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r1c0' });
    expect(next.players[0].wonCards).toEqual([treasureCard('b1', 'duck', 2)]);
    expect(next.players[1].wonCards).toEqual([]);
  });
});

describe('drawCardForCurrentPlayer / reducer — Fata Morgana', () => {
  it('no card to borrow from the right neighbor: the draw is discarded, the turn is NOT closed, and the next card is drawn immediately', () => {
    const state = buildTestState({
      players: [
        { id: 'player-1', name: 'Alice', wonCards: [] },
        { id: 'player-2', name: 'Bob', wonCards: [] }, // right neighbor, has nothing
      ],
      drawPile: [{ kind: 'special', id: 'fm1', specialType: 'FATA_MORGANA' }, treasureCard('c1', 'scarab', 1)],
    });
    const next = drawCardForCurrentPlayer(state);
    expect(next.currentPlayerIndex).toBe(0); // still player-1 — turn NOT closed
    expect(next.activeCard).toEqual(treasureCard('c1', 'scarab', 1));
    expect(next.turnPhase).toBe('SEARCHING');
  });

  it('borrows a card from the right neighbor and awaits a real search for its treasure', () => {
    const state = buildTestState({
      players: [
        { id: 'player-1', name: 'Alice', wonCards: [] },
        { id: 'player-2', name: 'Bob', wonCards: [treasureCard('b1', 'mummy', 3)] },
      ],
      drawPile: [{ kind: 'special', id: 'fm1', specialType: 'FATA_MORGANA' }],
    });
    const next = drawCardForCurrentPlayer(state);
    expect(next.turnPhase).toBe('AWAITING_FATA_MORGANA_SLIDE');
    expect(next.pendingSpecialEffect).toEqual({
      type: 'FATA_MORGANA',
      drawerId: 'player-1',
      neighborId: 'player-2',
      card: treasureCard('b1', 'mummy', 3),
    });
    expect(next.players[1].wonCards).toEqual([]); // tentatively removed already
  });

  it('success: the borrowed card is finalized into the drawer\'s own wonCards', () => {
    let state = buildTestState({
      turnPhase: 'AWAITING_FATA_MORGANA_SLIDE',
      pendingSpecialEffect: { type: 'FATA_MORGANA', drawerId: 'player-1', neighborId: 'player-2', card: treasureCard('b1', 'mummy', 3) },
      drawPile: [treasureCard('c1', 'scarab', 1)],
    });
    state = updateCell(state, 'r1c0', { treasureId: 'mummy', hasPyramid: true });

    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r1c0' });
    expect(next.players[0].wonCards).toEqual([treasureCard('b1', 'mummy', 3)]);
    expect(next.players[1].wonCards).toEqual([]);
    expect(next.turnPhase).toBe('SEARCHING');
  });

  it('failure: the exact borrowed card returns to the neighbor', () => {
    let state = buildTestState({
      turnPhase: 'AWAITING_FATA_MORGANA_SLIDE',
      pendingSpecialEffect: { type: 'FATA_MORGANA', drawerId: 'player-1', neighborId: 'player-2', card: treasureCard('b1', 'mummy', 3) },
      // A DIFFERENT treasureId than the wrong reveal below — see the
      // identical note in the Sivatagi póker failure test above.
      drawPile: [treasureCard('c1', 'duck', 1)],
    });
    state = updateCell(state, 'r1c0', { treasureId: 'scarab', hasPyramid: true }); // wrong

    const next = reducer(state, { type: 'SLIDE_PYRAMID', fromCellId: 'r1c0' });
    expect(next.players[1].wonCards).toEqual([treasureCard('b1', 'mummy', 3)]); // returned
    expect(next.players[0].wonCards).toEqual([]);
  });
});
