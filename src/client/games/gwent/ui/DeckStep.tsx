import { useState } from 'react';
import { Button } from '../../../ui-kit/Button';
import { LEADER_DEFS } from '../../../../shared/games/gwent/engine/leaderDefs';
import type { CardDef, Faction } from '../../../../shared/games/gwent/engine/types';
import {
  cardsForFaction,
  MIN_NON_HERO_UNIT_CARDS,
  validateDeckDraft,
  type DeckCardCounts,
} from '../../../../shared/games/gwent/engine/deckRules';
import { saveGwentDeck } from './gwentDeckPersistence';
import { factionLabel } from './factionDisplay';
import { CardCountGrid } from './CardCountGrid';
import styles from './GwentSetupPage.module.css';

export interface DeckStepProps {
  faction: Faction;
  leaderId: string;
  cardCounts: DeckCardCounts;
  onCardCountsChange: (next: DeckCardCounts) => void;
  onBack: () => void;
}

export function DeckStep({ faction, leaderId, cardCounts, onCardCountsChange, onBack }: DeckStepProps) {
  const [savedMessage, setSavedMessage] = useState(false);

  const availableCards = cardsForFaction(faction);
  const units = availableCards.filter((c) => c.kind === 'Unit');
  const specials = availableCards.filter((c) => c.kind !== 'Unit');
  const validation = validateDeckDraft({ faction, leaderId, cardCounts });

  function changeCount(def: CardDef, delta: number): void {
    const current = cardCounts[def.id] ?? 0;
    const next = Math.max(0, Math.min(def.copies, current + delta));
    if (next !== current) onCardCountsChange({ ...cardCounts, [def.id]: next });
    setSavedMessage(false);
  }

  function handleSave(): void {
    if (!validation.valid) return;
    saveGwentDeck({ faction, leaderId, cardCounts });
    setSavedMessage(true);
  }

  return (
    <>
      <div className={styles.stepHeader}>
        <Button variant="secondary" onClick={onBack}>
          ← Vezér
        </Button>
        <p>
          {factionLabel(faction)} — vezér: {LEADER_DEFS.find((l) => l.id === leaderId)?.name}
        </p>
      </div>

      <div className={styles.summary}>
        <span>
          Nem-Hero egységkártya: {validation.nonHeroUnitCount} / {MIN_NON_HERO_UNIT_CARDS}
        </span>
        <span>Lapok összesen a paliban: {validation.totalCardCount}</span>
      </div>
      {validation.errors.length > 0 && (
        <ul className={styles.errors}>
          {validation.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <CardCountGrid title="Egységkártyák" cards={units} cardCounts={cardCounts} onChangeCount={changeCount} />
      <CardCountGrid title="Speciális kártyák" cards={specials} cardCounts={cardCounts} onChangeCount={changeCount} />

      <div className={styles.saveRow}>
        <Button onClick={handleSave} disabled={!validation.valid}>
          Pakli mentése
        </Button>
        {savedMessage && <span className={styles.savedMessage}>Elmentve.</span>}
      </div>
    </>
  );
}
