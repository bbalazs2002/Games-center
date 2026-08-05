import { useState } from 'react';
import { Button } from '../../../ui-kit/Button';
import { Select } from '../../../ui-kit/Select';
import type { CardDef, Faction } from '../../../../shared/games/gwent/engine/types';
import {
  cardsForFaction,
  MIN_NON_HERO_UNIT_CARDS,
  validateDeckDraft,
  type DeckCardCounts,
} from '../../../../shared/games/gwent/engine/deckRules';
import { CARD_SORT_OPTIONS, sortCards, type CardSortKey } from './cardDisplay';
import { CardCountGrid } from './CardCountGrid';
import { CardCarouselModal, type CarouselEntry } from './board/CardCarouselModal';
import { buildTestDeckCounts } from './testDeckPresets';
import styles from './GwentSetupPage.module.css';

export interface DeckStepProps {
  faction: Faction;
  leaderId: string;
  cardCounts: DeckCardCounts;
  onCardCountsChange: (next: DeckCardCounts) => void;
}

/**
 * "Pakli mentése" moved up to GwentMatchSetupPage (Gwent-0c.2 §D, 7. pont — merged into the wizard's own button row, in one line, instead of a separate stacked row here).
 *
 * Gwent-0c.4 §A: the faction/leader `<Select>` switchers that used to live
 * here are gone — faction/leader are now picked via the always-visible
 * FactionStep/LeaderStep image grids above (one page, no more wizard steps),
 * so a second, redundant text-dropdown for the same choice would just be
 * clutter.
 */
export function DeckStep({ faction, leaderId, cardCounts, onCardCountsChange }: DeckStepProps) {
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

  function changeCount(def: CardDef, delta: number): void {
    const current = cardCounts[def.id] ?? 0;
    const next = Math.max(0, Math.min(def.copies, current + delta));
    if (next !== current) onCardCountsChange({ ...cardCounts, [def.id]: next });
  }

  return (
    <>
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
        {/* Dev/teszt-kényelmi gomb (2026-08-05): egy kattintással kitölt egy garantáltan érvényes teszt-paklit, hogy ne kelljen minden teszt-parti előtt végigkattintani az építést. */}
        <Button variant="secondary" onClick={() => onCardCountsChange(buildTestDeckCounts(faction))}>
          Teszt pakli kitöltése
        </Button>
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

      <CardCarouselModal entries={detailCard ? ([{ type: 'catalog', def: detailCard }] satisfies CarouselEntry[]) : null} onClose={() => setDetailCard(null)} />
    </>
  );
}
