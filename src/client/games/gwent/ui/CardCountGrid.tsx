import { assetUrl } from '../../../core/assetUrl';
import { CardGrid } from '../../../ui-kit/CardGrid';
import type { CardDef } from '../../../../shared/games/gwent/engine/types';
import type { DeckCardCounts } from '../../../../shared/games/gwent/engine/deckRules';
import { cardMechanicTag, cardRowLine, cardSummaryLine } from './cardDisplay';
import styles from './GwentSetupPage.module.css';

function subtitle(def: CardDef) {
  const mechanic = cardMechanicTag(def);
  return (
    <>
      <div>{cardSummaryLine(def)}</div>
      {cardRowLine(def) && <div>{cardRowLine(def)}</div>}
      {mechanic && <div className={styles.mechanicTag}>{mechanic}</div>}
    </>
  );
}

export interface CardCountGridProps {
  title: string;
  cards: CardDef[];
  cardCounts: DeckCardCounts;
  onChangeCount: (def: CardDef, delta: number) => void;
  onShowDetail: (def: CardDef) => void;
}

/**
 * A titled CardGrid of deck-builder cards with a per-tile +/- quantity stepper — shared by the unit- and special-card sections of DeckStep.
 *
 * Gwent-0c.4 §C: the magnifier detail button is gone — clicking the card
 * tile itself now opens the detail modal (`onShowDetail`); the +/- stepper
 * is the ONLY way left to change the count, and both buttons are always
 * shown (previously the tile click was "+1" and "−" only appeared once the
 * count was already above 0).
 */
export function CardCountGrid({ title, cards, cardCounts, onChangeCount, onShowDetail }: CardCountGridProps) {
  return (
    <>
      <h2>{title}</h2>
      <CardGrid
        items={cards}
        getKey={(c) => c.id}
        getImageUrl={(c) => assetUrl(c.imagePaths[0])}
        getLabel={(c) => c.name}
        getSubtitle={subtitle}
        onSelect={onShowDetail}
        renderBadge={(def) => {
          const count = cardCounts[def.id] ?? 0;
          return (
            <div className={styles.stepper}>
              <button
                type="button"
                className={styles.stepperButton}
                disabled={count === 0}
                aria-label={`${def.name} eggyel kevesebb`}
                onClick={(event) => {
                  event.stopPropagation();
                  onChangeCount(def, -1);
                }}
              >
                −
              </button>
              <span className={styles.stepperCount}>
                {count} / {def.copies}
              </span>
              <button
                type="button"
                className={styles.stepperButton}
                disabled={count >= def.copies}
                aria-label={`${def.name} eggyel több`}
                onClick={(event) => {
                  event.stopPropagation();
                  onChangeCount(def, 1);
                }}
              >
                +
              </button>
            </div>
          );
        }}
      />
    </>
  );
}
