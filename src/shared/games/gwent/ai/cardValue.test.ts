import { describe, expect, it } from 'vitest';
import { estimateCardValue } from './cardValue';
import type { CardDef } from '../engine/types';

function unit(overrides: Partial<CardDef> = {}): CardDef {
  return {
    id: 'test-unit',
    name: 'Test Unit',
    faction: 'Neutral',
    kind: 'Unit',
    row: 'Melee',
    basePower: 5,
    abilities: [],
    mustersWithIds: [],
    rowScorch: null,
    weatherRow: null,
    specialText: null,
    cardText: null,
    copies: 1,
    imagePaths: [],
    ...overrides,
  };
}

describe('estimateCardValue', () => {
  it('uses basePower as the baseline for a plain unit', () => {
    expect(estimateCardValue(unit({ basePower: 7, abilities: [] }))).toBe(7);
  });

  it('adds a bonus for each recognized synergy ability, stacking', () => {
    const plain = estimateCardValue(unit({ basePower: 4, abilities: [] }));
    expect(estimateCardValue(unit({ basePower: 4, abilities: ['Muster'] }))).toBeGreaterThan(plain);
    expect(estimateCardValue(unit({ basePower: 4, abilities: ['TightBond'] }))).toBeGreaterThan(plain);
    expect(estimateCardValue(unit({ basePower: 4, abilities: ['Medic'] }))).toBeGreaterThan(plain);
    expect(estimateCardValue(unit({ basePower: 4, abilities: ['Spy'] }))).toBeGreaterThan(plain);
    expect(estimateCardValue(unit({ basePower: 4, abilities: ['MoraleBoost'] }))).toBeGreaterThan(plain);
    expect(estimateCardValue(unit({ basePower: 4, abilities: ['Hero'] }))).toBeGreaterThan(plain);
    // Two abilities together are worth more than either alone.
    const both = estimateCardValue(unit({ basePower: 4, abilities: ['Muster', 'Medic'] }));
    expect(both).toBeGreaterThan(estimateCardValue(unit({ basePower: 4, abilities: ['Muster'] })));
    expect(both).toBeGreaterThan(estimateCardValue(unit({ basePower: 4, abilities: ['Medic'] })));
  });

  it('gives non-unit cards a flat, moderate baseline regardless of kind', () => {
    const decoy = estimateCardValue(unit({ kind: 'Decoy', basePower: null }));
    const horn = estimateCardValue(unit({ kind: 'Horn', basePower: null }));
    const scorch = estimateCardValue(unit({ kind: 'Scorch', basePower: null }));
    const weather = estimateCardValue(unit({ kind: 'Weather', basePower: null }));
    expect(decoy).toBe(horn);
    expect(horn).toBe(scorch);
    expect(scorch).toBe(weather);
    expect(decoy).toBeGreaterThan(0);
  });

  it('treats a null basePower unit (should not normally occur) as worth only its ability bonuses', () => {
    expect(estimateCardValue(unit({ basePower: null, abilities: [] }))).toBe(0);
  });
});
