import { useState, type ReactNode } from 'react';
import { Button } from '../../../ui-kit/Button';
import { Select } from '../../../ui-kit/Select';
import type { CardDef, Faction } from '../../../../shared/games/gwent/engine/types';
import {
  cardsForFaction,
  MIN_NON_HERO_UNIT_CARDS,
  validateDeckDraft,
  type DeckCardCounts,
} from '../../../../shared/games/gwent/engine/deckRules';
import type { CardInstance } from '../../../../shared/games/gwent/engine/state';
import { CARD_SORT_OPTIONS, sortCards, type CardSortKey } from './cardDisplay';
import { CardTile } from './board/CardTile';
import { CardCarouselModal, type CarouselEntry } from './board/CardCarouselModal';
import { buildTestDeckCounts } from './testDeckPresets';
import styles from './GwentSetupPage.module.css';

export interface DeckStepProps {
  faction: Faction;
  leaderId: string;
  cardCounts: DeckCardCounts;
  onCardCountsChange: (next: DeckCardCounts) => void;
  /** Gwent-0d §4: the leader picker + selected leader card + deck stats — composed by GwentDeckBuilder.tsx, slotted here between the two card columns. */
  middleColumn: ReactNode;
}

interface DeckCardTileProps {
  def: CardDef;
  count: number;
  onAdd?: () => void;
  onRemove?: () => void;
  onInfo: () => void;
}

/** A single dense collection/deck tile — the card's own small crop (Gwent-0d §1) IS the add/remove button; a tiny corner "i" opens the shared carousel for a closer look, a sibling button (not nested — CardTile is itself a `<button>`). */
function DeckCardTile({ def, count, onAdd, onRemove, onInfo }: DeckCardTileProps) {
  // No real CardInstance exists yet for a catalog entry — id-stable synthetic one, same trick CardCarouselModal's 'catalog' entries avoid needing (Gwent-0d §2 doc comment).
  const instance: CardInstance = { instanceId: def.id, defId: def.id, chosenRow: null };
  const atMax = onAdd !== undefined && count >= def.copies;
  return (
    <div className={styles.deckTile}>
      <CardTile instance={instance} size="small" disabled={atMax} onClick={onAdd ?? onRemove} />
      {count > 0 && <span className={styles.deckTileCount}>×{count}</span>}
      <button
        type="button"
        className={styles.deckTileInfo}
        aria-label={`${def.name} részletei`}
        onClick={(event) => {
          event.stopPropagation();
          onInfo();
        }}
      >
        i
      </button>
    </div>
  );
}

/**
 * Gwent-0d §4: a korábbi EGY görgethető lista (Egységkártyák + Speciális
 * kártyák egymás alatt) helyett KÉT hasáb — "Gyűjtemény" (a frakció összes
 * lapja, kattintásra +1) és "Pakliban" (csak a `count > 0` lapok, kattintásra
 * −1) — köztük a `middleColumn` (vezér + statisztika). A `cardCounts`/
 * `changeCount` állapot-modell változatlan, csak a renderelés alakult át.
 */
export function DeckStep({ faction, leaderId, cardCounts, onCardCountsChange, middleColumn }: DeckStepProps) {
  const [sortKey, setSortKey] = useState<CardSortKey>('name');
  const [detailGroup, setDetailGroup] = useState<{ list: CardDef[]; index: number } | null>(null);

  const collection = sortCards(cardsForFaction(faction), sortKey);
  const owned = collection.filter((def) => (cardCounts[def.id] ?? 0) > 0);
  const validation = validateDeckDraft({ faction, leaderId, cardCounts });

  function changeCount(def: CardDef, delta: number): void {
    const current = cardCounts[def.id] ?? 0;
    const next = Math.max(0, Math.min(def.copies, current + delta));
    if (next !== current) onCardCountsChange({ ...cardCounts, [def.id]: next });
  }

  function openDetail(list: CardDef[], def: CardDef): void {
    setDetailGroup({ list, index: Math.max(0, list.findIndex((c) => c.id === def.id)) });
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

      <div className={styles.deckColumns}>
        <div className={styles.deckColumn}>
          <h2>Gyűjtemény</h2>
          <div className={styles.deckGrid}>
            {collection.map((def) => (
              <DeckCardTile
                key={def.id}
                def={def}
                count={cardCounts[def.id] ?? 0}
                onAdd={() => changeCount(def, 1)}
                onInfo={() => openDetail(collection, def)}
              />
            ))}
          </div>
        </div>

        <div className={styles.deckMiddleColumn}>{middleColumn}</div>

        <div className={styles.deckColumn}>
          <h2>Pakliban</h2>
          {owned.length === 0 && <p className={styles.deckColumnEmpty}>Még nincs egy lap sem a paliban.</p>}
          <div className={styles.deckGrid}>
            {owned.map((def) => (
              <DeckCardTile
                key={def.id}
                def={def}
                count={cardCounts[def.id] ?? 0}
                onRemove={() => changeCount(def, -1)}
                onInfo={() => openDetail(owned, def)}
              />
            ))}
          </div>
        </div>
      </div>

      <CardCarouselModal
        entries={detailGroup ? (detailGroup.list.map((def) => ({ type: 'catalog', def })) satisfies CarouselEntry[]) : null}
        initialIndex={detailGroup?.index}
        onClose={() => setDetailGroup(null)}
      />
    </>
  );
}
