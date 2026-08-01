import { describe, expect, it } from 'vitest';
import { CARD_DEFS } from './cardDefs';
import { LEADER_DEFS } from './leaderDefs';
import { cardsForFaction, isHeroCard, MIN_NON_HERO_UNIT_CARDS, validateDeckDraft, type DeckCardCounts } from './deckRules';

const FACTION = 'Monsters' as const;
const LEADER_ID = LEADER_DEFS.find((l) => l.faction === FACTION)!.id;

/** Greedily fills non-Hero unit copies (respecting each card's own cap) up to the 22-card minimum. */
function buildMinimalLegalCounts(): DeckCardCounts {
  const counts: DeckCardCounts = {};
  let total = 0;
  for (const def of cardsForFaction(FACTION)) {
    if (def.kind !== 'Unit' || isHeroCard(def)) continue;
    if (total >= MIN_NON_HERO_UNIT_CARDS) break;
    const take = Math.min(def.copies, MIN_NON_HERO_UNIT_CARDS - total);
    counts[def.id] = take;
    total += take;
  }
  return counts;
}

describe('validateDeckDraft', () => {
  it('accepts a deck with a matching leader and >= 22 non-Hero unit cards', () => {
    const result = validateDeckDraft({ faction: FACTION, leaderId: LEADER_ID, cardCounts: buildMinimalLegalCounts() });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.nonHeroUnitCount).toBeGreaterThanOrEqual(MIN_NON_HERO_UNIT_CARDS);
  });

  it('rejects a deck with fewer than 22 non-Hero unit cards', () => {
    const result = validateDeckDraft({ faction: FACTION, leaderId: LEADER_ID, cardCounts: {} });
    expect(result.valid).toBe(false);
    expect(result.nonHeroUnitCount).toBe(0);
  });

  it('does not count Hero cards toward the 22-card minimum', () => {
    const hero = CARD_DEFS.find((c) => c.faction === FACTION && isHeroCard(c));
    expect(hero).toBeDefined();
    const counts = buildMinimalLegalCounts();
    // Removing one legal non-Hero copy and replacing it 1:1 with Hero copies must not stay valid.
    const [someUnitId] = Object.keys(counts);
    delete counts[someUnitId];
    counts[hero!.id] = 1;
    const result = validateDeckDraft({ faction: FACTION, leaderId: LEADER_ID, cardCounts: counts });
    expect(result.valid).toBe(false);
  });

  it('rejects a leader from a different faction than the chosen one', () => {
    const otherLeader = LEADER_DEFS.find((l) => l.faction !== FACTION)!;
    const result = validateDeckDraft({ faction: FACTION, leaderId: otherLeader.id, cardCounts: buildMinimalLegalCounts() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('vezér'))).toBe(true);
  });

  it('rejects a card from a different, non-Neutral faction', () => {
    const foreignCard = CARD_DEFS.find((c) => c.faction !== 'Neutral' && c.faction !== FACTION)!;
    const counts = { ...buildMinimalLegalCounts(), [foreignCard.id]: 1 };
    const result = validateDeckDraft({ faction: FACTION, leaderId: LEADER_ID, cardCounts: counts });
    expect(result.valid).toBe(false);
  });

  it('rejects exceeding a card\'s official copy limit', () => {
    const def = CARD_DEFS.find((c) => c.faction === FACTION && c.kind === 'Unit')!;
    const counts = { ...buildMinimalLegalCounts(), [def.id]: def.copies + 1 };
    const result = validateDeckDraft({ faction: FACTION, leaderId: LEADER_ID, cardCounts: counts });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes(def.name))).toBe(true);
  });

  it('allows Neutral cards in any faction deck', () => {
    const neutral = CARD_DEFS.find((c) => c.faction === 'Neutral' && c.kind === 'Unit' && !isHeroCard(c))!;
    const counts = { ...buildMinimalLegalCounts(), [neutral.id]: 1 };
    const result = validateDeckDraft({ faction: FACTION, leaderId: LEADER_ID, cardCounts: counts });
    expect(result.valid).toBe(true);
  });
});
