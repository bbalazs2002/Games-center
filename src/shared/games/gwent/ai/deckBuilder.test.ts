import { describe, expect, it } from 'vitest';
import { buildTacticalAiDeckConfig } from './deckBuilder';
import { cardsForFaction, MIN_NON_HERO_UNIT_CARDS, validateDeckDraft } from '../engine/deckRules';
import { getLeaderDef } from '../engine/leaderDefs';

const FACTIONS = ['NorthernRealms', 'Nilfgaard', 'Monsters', 'Scoiatael'] as const;

describe('buildTacticalAiDeckConfig', () => {
  it('always produces a legal deck, across many random runs', () => {
    for (let i = 0; i < 50; i++) {
      const config = buildTacticalAiDeckConfig('AI');
      const validation = validateDeckDraft(config);
      expect(validation.valid, validation.errors.join('; ')).toBe(true);
    }
  });

  it("the leader's faction always matches the deck's faction", () => {
    for (let i = 0; i < 50; i++) {
      const config = buildTacticalAiDeckConfig('AI');
      expect(getLeaderDef(config.leaderId).faction).toBe(config.faction);
    }
  });

  it('picks a legal faction every time', () => {
    for (let i = 0; i < 50; i++) {
      expect(FACTIONS).toContain(buildTacticalAiDeckConfig('AI').faction);
    }
  });

  it('builds a TIGHT deck — non-Hero unit count is the legal minimum, not padded', () => {
    for (let i = 0; i < 30; i++) {
      const config = buildTacticalAiDeckConfig('AI');
      const validation = validateDeckDraft(config);
      // Can only overshoot by however many copies the single card that crossed
      // the threshold had — never padded with extra, unnecessary cards beyond that.
      expect(validation.nonHeroUnitCount).toBeGreaterThanOrEqual(MIN_NON_HERO_UNIT_CARDS);
      expect(validation.nonHeroUnitCount).toBeLessThan(MIN_NON_HERO_UNIT_CARDS + 10);
    }
  });

  it('includes every available special card (Decoy/Horn/Scorch/Weather) for the chosen faction', () => {
    const config = buildTacticalAiDeckConfig('AI');
    const specials = cardsForFaction(config.faction).filter((def) => def.kind !== 'Unit');
    for (const def of specials) {
      expect(config.cardCounts[def.id]).toBe(def.copies);
    }
  });

  it('never exceeds a card\'s legal copy count', () => {
    for (let i = 0; i < 30; i++) {
      const config = buildTacticalAiDeckConfig('AI');
      const pool = cardsForFaction(config.faction);
      for (const [defId, count] of Object.entries(config.cardCounts)) {
        const def = pool.find((d) => d.id === defId)!;
        expect(count).toBeLessThanOrEqual(def.copies);
      }
    }
  });
});
