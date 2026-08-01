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
import { FACTION_OPTIONS } from './factionDisplay';
import { CARD_SORT_OPTIONS, sortCards, type CardSortKey } from './cardDisplay';
import { CardCountGrid } from './CardCountGrid';
import { CardDetailModal } from './CardDetailModal';
import styles from './GwentSetupPage.module.css';

export interface DeckStepProps {
  faction: Faction;
  leaderId: string;
  cardCounts: DeckCardCounts;
  onCardCountsChange: (next: DeckCardCounts) => void;
  onFactionChange: (next: Faction) => void;
  onLeaderChange: (next: string) => void;
}

export function DeckStep({ faction, leaderId, cardCounts, onCardCountsChange, onFactionChange, onLeaderChange }: DeckStepProps) {
  const [savedMessage, setSavedMessage] = useState(false);
  const [sortKey, setSortKey] = useState<CardSortKey>('name');
  const [detailCard, setDetailCard] = useState<CardDef | null>(null);

  const availableCards = cardsForFaction(faction);
  const units = sortCards(
    availableCards.filter((c) => c.kind === 'Unit'),
    sortKey,
  );
  const specials = sortCards(
    availableCards.filter((c) => c.kind !== 'Unit'),
    sortKey,
  );
  const validation = validateDeckDraft({ faction, leaderId, cardCounts });
  const leadersForFaction = LEADER_DEFS.filter((l) => l.faction === faction);

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
        <label className={styles.switcher}>
          Frakció
          <select value={faction} onChange={(event) => onFactionChange(event.target.value as Faction)}>
            {FACTION_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.switcher}>
          Vezér
          <select value={leaderId} onChange={(event) => onLeaderChange(event.target.value)}>
            {leadersForFaction.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
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

      <div className={styles.switcher}>
        Rendezés
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value as CardSortKey)}>
          {CARD_SORT_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <CardCountGrid
        title="Egységkártyák"
        cards={units}
        cardCounts={cardCounts}
        onChangeCount={changeCount}
        onShowDetail={setDetailCard}
      />
      <CardCountGrid
        title="Speciális kártyák"
        cards={specials}
        cardCounts={cardCounts}
        onChangeCount={changeCount}
        onShowDetail={setDetailCard}
      />

      <div className={styles.saveRow}>
        <Button onClick={handleSave} disabled={!validation.valid}>
          Pakli mentése
        </Button>
        {savedMessage && <span className={styles.savedMessage}>Elmentve.</span>}
      </div>

      <CardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />
    </>
  );
}
