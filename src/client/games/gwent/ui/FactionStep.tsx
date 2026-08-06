import { useLayoutEffect } from 'react';
import type { Faction } from '../../../../shared/games/gwent/engine/types';
import { FactionIcon } from './board/factionIcons';
import { FACTION_OPTIONS } from './factionDisplay';
import styles from './GwentSetupPage.module.css';

export interface FactionStepProps {
  selectedFaction: Faction | null;
  onSelect: (faction: Faction) => void;
}

/**
 * Gwent-0d §4: a korábbi 4-csempés CardGrid helyett középre igazított
 * fejléc-váltó — a referencia-kliens a frakciót balra/jobbra kattintva
 * cikliken váltja, nem egy rácsból választja ki. `selectedFaction === null`
 * csak a legelső render pillanatáig áll fenn — a `useLayoutEffect` a
 * festés előtt lezárja az első frakciót, hogy sose látsszon üres állapot.
 */
export function FactionStep({ selectedFaction, onSelect }: FactionStepProps) {
  useLayoutEffect(() => {
    if (selectedFaction === null) onSelect(FACTION_OPTIONS[0].id);
    // Csak az induló, még kiválasztatlan állapotot zárja le — a felhasználó
    // saját váltásait sose írja felül.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const index = Math.max(
    0,
    FACTION_OPTIONS.findIndex((f) => f.id === selectedFaction),
  );
  const current = FACTION_OPTIONS[index];
  const prev = FACTION_OPTIONS[(index - 1 + FACTION_OPTIONS.length) % FACTION_OPTIONS.length];
  const next = FACTION_OPTIONS[(index + 1) % FACTION_OPTIONS.length];

  return (
    <div className={styles.factionSwitcher}>
      <button type="button" className={styles.factionNeighbor} onClick={() => onSelect(prev.id)}>
        ‹ {prev.label}
      </button>
      <div className={styles.factionCurrent}>
        <span className={styles.factionEmblem}>
          <FactionIcon faction={current.id} />
        </span>
        <span className={styles.factionName}>{current.label}</span>
        <span className={styles.factionBonus}>{current.bonus}</span>
      </div>
      <button type="button" className={styles.factionNeighbor} onClick={() => onSelect(next.id)}>
        {next.label} ›
      </button>
    </div>
  );
}
