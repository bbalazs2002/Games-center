import { useState } from 'react';
import { Select } from '../../../ui-kit/Select';
import { LEADER_DEFS } from '../../../../shared/games/gwent/engine/leaderDefs';
import type { CardDef, Faction } from '../../../../shared/games/gwent/engine/types';
import {
  cardsForFaction,
  MIN_NON_HERO_UNIT_CARDS,
  validateDeckDraft,
  type DeckCardCounts,
} from '../../../../shared/games/gwent/engine/deckRules';
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

/** "Pakli mentése" moved up to GwentMatchSetupPage (Gwent-0c.2 §D, 7. pont — merged into the wizard's own button row, in one line, instead of a separate stacked row here). */
export function DeckStep({ faction, leaderId, cardCounts, onCardCountsChange, onFactionChange, onLeaderChange }: DeckStepProps) {
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
  }

  return (
    <>
      <div className={styles.stepHeader}>
        <div className={styles.switcher}>
          <span>Frakció</span>
          <Select
            value={faction}
            onChange={(value) => onFactionChange(value as Faction)}
            options={FACTION_OPTIONS.map((f) => ({ value: f.id, label: f.label }))}
          />
        </div>
        <div className={styles.switcher}>
          <span>Vezér</span>
          <Select value={leaderId} onChange={onLeaderChange} options={leadersForFaction.map((l) => ({ value: l.id, label: l.name }))} />
        </div>
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
        <span>Rendezés</span>
        <Select
          value={sortKey}
          onChange={(value) => setSortKey(value as CardSortKey)}
          options={CARD_SORT_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
        />
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

      <CardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />
    </>
  );
}
