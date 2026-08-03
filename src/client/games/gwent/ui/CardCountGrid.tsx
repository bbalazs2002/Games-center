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

/** A titled CardGrid of deck-builder cards with a per-tile +/- quantity stepper and a magnifier detail button — shared by the unit- and special-card sections of DeckStep. */
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
        onSelect={(c) => onChangeCount(c, 1)}
        renderCorner={(def) => (
          <button
            type="button"
            className={styles.magnifierButton}
            aria-label={`${def.name} nagyítása`}
            onClick={(event) => {
              event.stopPropagation();
              onShowDetail(def);
            }}
          >
            🔍
          </button>
        )}
        renderBadge={(def) => {
          const count = cardCounts[def.id] ?? 0;
          return (
            <div className={styles.stepper}>
              {count > 0 && (
                <button
                  type="button"
                  className={styles.stepperButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChangeCount(def, -1);
                  }}
                >
                  −
                </button>
              )}
              <span className={styles.stepperCount}>
                {count} / {def.copies}
              </span>
            </div>
          );
        }}
      />
    </>
  );
}
