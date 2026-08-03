import { describe, expect, it } from 'vitest';
import { createInitialState } from './initialState';
import { CARD_DEFS } from './cardDefs';
import { FRANCESCA_DAISY_OF_THE_VALLEY } from './leaderConstants';
import type { DeckCardCounts } from './deckRules';

const TIGHT_BOND = 'nilfgaard-impera-brigade-guard'; // copies 4

/** A pool of at least `minCount` real, distinct cards (any faction) — big enough that the starting hand (10, or 11 for Daisy of the Valley) never runs out of cards to deal. */
function bigCardPool(minCount: number): DeckCardCounts {
  const counts: DeckCardCounts = {};
  let total = 0;
  for (const def of CARD_DEFS) {
    if (total >= minCount) break;
    counts[def.id] = def.copies;
    total += def.copies;
  }
  return counts;
}

describe('createInitialState', () => {
  it('expands cardCounts into unique CardInstances, deals 10, and leaves the rest in the deck', () => {
    const state = createInitialState([
      { name: 'Alice', faction: 'Nilfgaard', leaderId: 'test-leader-1', cardCounts: { [TIGHT_BOND]: 4 } },
      { name: 'Bob', faction: 'Monsters', leaderId: 'test-leader-2', cardCounts: {} },
    ]);
    const alice = state.players[0];
    expect(alice.hand).toHaveLength(4); // fewer than 10 cards total in the pool — deals whatever exists
    expect(alice.deck).toHaveLength(0);
    const allIds = new Set([...alice.hand, ...alice.deck].map((c) => c.instanceId));
    expect(allIds.size).toBe(4); // every instanceId unique even though they share one defId
    expect(state.phase).toBe('MULLIGAN');
    expect(state.round).toBe(1);
  });

  it('Francesca Daisy of the Valley draws 1 extra starting card', () => {
    const bigPool = bigCardPool(15);
    const withoutDaisy = createInitialState([
      { name: 'Alice', faction: 'Nilfgaard', leaderId: 'test-leader-1', cardCounts: bigPool },
      { name: 'Bob', faction: 'Monsters', leaderId: 'test-leader-2', cardCounts: {} },
    ]);
    const withDaisy = createInitialState([
      { name: 'Alice', faction: 'Scoiatael', leaderId: FRANCESCA_DAISY_OF_THE_VALLEY, cardCounts: bigPool },
      { name: 'Bob', faction: 'Monsters', leaderId: 'test-leader-2', cardCounts: {} },
    ]);
    expect(withDaisy.players[0].hand.length).toBe(withoutDaisy.players[0].hand.length + 1);
  });

  it('throws on a stale/unknown card id, instead of failing later mid-game', () => {
    expect(() =>
      createInitialState([
        { name: 'Alice', faction: 'Nilfgaard', leaderId: 'test-leader-1', cardCounts: { 'not-a-real-card': 1 } },
        { name: 'Bob', faction: 'Monsters', leaderId: 'test-leader-2', cardCounts: {} },
      ]),
    ).toThrow();
  });
});
