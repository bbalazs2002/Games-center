import { describe, expect, it } from 'vitest';
import { LEADER_DEFS, getLeaderDef } from './leaderDefs';

describe('LEADER_DEFS', () => {
  it('has exactly 20 entries (5 per base-game faction, Skellige excluded — see 0a-spec §4.5)', () => {
    expect(LEADER_DEFS.length).toBe(20);
  });

  it('has exactly 5 leaders per faction', () => {
    for (const faction of ['NorthernRealms', 'Nilfgaard', 'Monsters', 'Scoiatael'] as const) {
      expect(LEADER_DEFS.filter((l) => l.faction === faction)).toHaveLength(5);
    }
  });

  it('has unique ids', () => {
    const ids = LEADER_DEFS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every id is resolvable via getLeaderDef', () => {
    for (const def of LEADER_DEFS) expect(getLeaderDef(def.id)).toBe(def);
  });

  it('throws for an unknown id', () => {
    expect(() => getLeaderDef('not-a-real-leader')).toThrow();
  });

  it('has a non-empty Hungarian ability description and at least one image', () => {
    for (const def of LEADER_DEFS) {
      expect(def.abilityDescription.length).toBeGreaterThan(0);
      expect(def.imagePaths.length).toBeGreaterThan(0);
    }
  });

  it('every leader has non-null cardText (2026-08-01 research round, see 0a-spec §9.7)', () => {
    for (const def of LEADER_DEFS) expect(def.cardText, def.name).not.toBeNull();
  });
});
