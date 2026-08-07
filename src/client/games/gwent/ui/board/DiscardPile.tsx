import { assetUrl } from '../../../../core/assetUrl';
import { getCardDef } from '@shared/games/gwent/engine/cardDefs';
import type { CardInstance } from '@shared/games/gwent/engine/state';
import { pickVariant } from './cardArtVariant';
import { useCardFlight } from './useCardFlight';
import styles from './DiscardPile.module.css';

const MAX_UNDER_LAYERS = 2;
const LAYER_OFFSET_PX = 2;

export interface DiscardPileProps {
  cards: CardInstance[];
  /** Registry key for the card-flight system, e.g. `discard:player-1`. */
  zoneKey: string;
  /** Opens a modal listing EVERY card in this pile (Gwent-0c.2 §O, 17. pont — no per-card magnifier anymore, the whole pile is the trigger). Omitted only when there's nothing to show. */
  onOpenAll?: () => void;
}

/**
 * The dobott lapok kupaca — always public (Gwent-0b: discard is never
 * masked), so unlike DeckPile this shows the LEGITIMATE top card's real
 * face (the array's last element — every discard push appends, see rules.ts
 * destroyStrongestAcross/reducer.ts), plus a couple of dimmed under-layers
 * hinting "there's more here", plus an exact-count badge.
 */
export function DiscardPile({ cards, zoneKey, onOpenAll }: DiscardPileProps) {
  const { registerZoneRef } = useCardFlight();
  const topCard = cards[cards.length - 1];
  const topCardDef = topCard ? getCardDef(topCard.defId) : null;
  const underLayerCount = Math.min(cards.length - 1, MAX_UNDER_LAYERS);
  const clickable = cards.length > 0 && !!onOpenAll;

  return (
    <div>
      <button
        type="button"
        className={[styles.pile, clickable && styles.pileClickable].filter(Boolean).join(' ')}
        onClick={clickable ? onOpenAll : undefined}
        disabled={!clickable}
        aria-label={clickable ? `Dobott lapok megtekintése (${cards.length})` : 'Dobott lapok — üres'}
      >
        {!topCard && <div className={styles.empty}>üres</div>}
        {Array.from({ length: underLayerCount }, (_, i) => {
          const depth = underLayerCount - i;
          return (
            <div
              key={`under-${i}`}
              className={[styles.layer, styles.underLayer].join(' ')}
              style={{ transform: `translate(${depth * LAYER_OFFSET_PX}px, ${-depth * LAYER_OFFSET_PX}px)` }}
            />
          );
        })}
        {topCard && topCardDef && (
          <div ref={registerZoneRef(zoneKey)} className={styles.layer}>
            <img className={styles.layerImage} src={assetUrl(pickVariant(topCard, topCardDef.imagePaths))} alt={topCardDef.name} />
          </div>
        )}
        {cards.length > 0 && <span className={styles.badge}>{cards.length}</span>}
      </button>
      <div className={styles.label}>Dobott lapok</div>
    </div>
  );
}
