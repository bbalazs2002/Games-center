import { CardGrid } from '../../../ui-kit/CardGrid';
import type { CardDef } from '../../../../shared/games/gwent/engine/types';
import type { DeckCardCounts } from '../../../../shared/games/gwent/engine/deckRules';
import styles from './GwentSetupPage.module.css';

function abilityLabel(def: CardDef): string {
  const parts: string[] = [];
  if (def.basePower !== null) parts.push(String(def.basePower));
  if (def.abilities.length > 0) parts.push(def.abilities.join(', '));
  if (def.kind !== 'Unit') parts.push(def.kind);
  return parts.join(' · ');
}

export interface CardCountGridProps {
  title: string;
  cards: CardDef[];
  cardCounts: DeckCardCounts;
  onChangeCount: (def: CardDef, delta: number) => void;
}

/** A titled CardGrid of deck-builder cards with a per-tile +/- quantity stepper — shared by the unit- and special-card sections of DeckStep. */
export function CardCountGrid({ title, cards, cardCounts, onChangeCount }: CardCountGridProps) {
  return (
    <>
      <h2>{title}</h2>
      <CardGrid
        items={cards}
        getKey={(c) => c.id}
        getImageUrl={(c) => c.imagePaths[0]}
        getLabel={(c) => c.name}
        getSubtitle={abilityLabel}
        onSelect={(c) => onChangeCount(c, 1)}
        renderBadge={(def) => {
          const count = cardCounts[def.id] ?? 0;
          if (count === 0) return null;
          return (
            <div className={styles.stepper}>
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
              <span className={styles.stepperCount}>{count}</span>
            </div>
          );
        }}
      />
    </>
  );
}
