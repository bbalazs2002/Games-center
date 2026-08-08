import { describe, expect, it } from 'vitest';
import { CARD_DEFS, getCardDef } from './cardDefs';

describe('CARD_DEFS', () => {
  it('has 134 entries (154 researched cards minus the 20 leaders — see gwent-0a-specifikacio.md §5.1)', () => {
    expect(CARD_DEFS.length).toBe(134);
  });

  it('has unique ids', () => {
    const ids = CARD_DEFS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every id is resolvable via getCardDef', () => {
    for (const def of CARD_DEFS) expect(getCardDef(def.id)).toBe(def);
  });

  it('throws for an unknown id', () => {
    expect(() => getCardDef('not-a-real-card')).toThrow();
  });

  it('has at least one image path per card', () => {
    for (const def of CARD_DEFS) expect(def.imagePaths.length).toBeGreaterThan(0);
  });

  it('has a positive copies count for every card', () => {
    for (const def of CARD_DEFS) expect(def.copies).toBeGreaterThan(0);
  });

  it('only Unit-kind cards carry a row or basePower', () => {
    for (const def of CARD_DEFS) {
      if (def.kind === 'Unit') continue;
      expect(def.row).toBeNull();
      expect(def.basePower).toBeNull();
    }
  });

  it('Agile units have no fixed row', () => {
    for (const def of CARD_DEFS) {
      if (def.abilities.includes('Agile')) expect(def.row).toBeNull();
    }
  });

  it('only Weather-kind cards carry a weatherRow', () => {
    for (const def of CARD_DEFS) {
      if (def.kind === 'Weather') expect(def.weatherRow).not.toBeNull();
      else expect(def.weatherRow).toBeNull();
    }
  });

  it('rowScorch is set on exactly Schirrú, Toad and Villentretenmerth (see 0a-spec §4.3)', () => {
    const withRowScorch = CARD_DEFS.filter((c) => c.rowScorch !== null).map((c) => c.name);
    expect(withRowScorch.sort()).toEqual(['Schirrú', 'Toad', 'Villentretenmerth']);
  });

  it('specialText is set on exactly Cow, Dandelion, and every other card whose mechanic needs an explanation the Nézegető mód carousel wouldn\'t otherwise show (real playtest report, 2026-08-08: Scorch had none)', () => {
    const withSpecialText = CARD_DEFS.filter((c) => c.specialText !== null).map((c) => c.name);
    expect(withSpecialText.sort()).toEqual(
      ['Biting Frost', 'Clear Weather', 'Commander\'s Horn', 'Cow', 'Dandelion', 'Decoy', 'Impenetrable Fog', 'Scorch', 'Torrential Rain'].sort(),
    );
  });

  it('Ice Giant has power 6 (corrected 2026-08-01, confirmed against the physical card)', () => {
    expect(CARD_DEFS.find((c) => c.name === 'Ice Giant')?.basePower).toBe(6);
  });

  it('Villentretenmerth is NOT a Hero (corrected 2026-08-01, confirmed against the physical card)', () => {
    const def = CARD_DEFS.find((c) => c.name === 'Villentretenmerth');
    expect(def?.abilities).not.toContain('Hero');
    expect(def?.rowScorch).not.toBeNull();
  });

  it('every card has non-null cardText (2026-08-01 research round, see 0a-spec §9.7)', () => {
    for (const def of CARD_DEFS) expect(def.cardText, def.name).not.toBeNull();
  });

  it('mustersWithIds is symmetric within a group (Crone/Vampire/Gaunter O\'Dimm — see 0a-spec §4.2)', () => {
    for (const def of CARD_DEFS) {
      for (const otherId of def.mustersWithIds) {
        const other = getCardDef(otherId);
        expect(other.mustersWithIds).toContain(def.id);
      }
    }
  });

  it('the Crone group musters as one 3-member group', () => {
    const crones = CARD_DEFS.filter((c) => c.name.startsWith('Crone '));
    expect(crones).toHaveLength(3);
    for (const crone of crones) expect(crone.mustersWithIds).toHaveLength(2);
  });

  it('the Vampire group musters as one 5-member group', () => {
    const vampires = CARD_DEFS.filter((c) => c.name.startsWith('Vampire '));
    expect(vampires).toHaveLength(5);
    for (const vampire of vampires) expect(vampire.mustersWithIds).toHaveLength(4);
  });
});
