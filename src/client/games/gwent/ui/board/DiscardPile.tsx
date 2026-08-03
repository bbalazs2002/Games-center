import { assetUrl } from '../../../../core/assetUrl';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import type { CardInstance } from '../../../../../shared/games/gwent/engine/state';
import { pickVariant } from './CardTile';
import { useCardFlight } from './cardFlight';
import styles from './DiscardPile.module.css';

const MAX_UNDER_LAYERS = 2;
const LAYER_OFFSET_PX = 2;

export interface DiscardPileProps {
  cards: CardInstance[];
  /** Registry key for the card-flight system, e.g. `discard:player-1`. */
  zoneKey: string;
}

/**
 * The dobott lapok kupaca — always public (Gwent-0b: discard is never
 * masked), so unlike DeckPile this shows the LEGITIMATE top card's real
 * face (the array's last element — every discard push appends, see rules.ts
 * destroyStrongestAcross/reducer.ts), plus a couple of dimmed under-layers
 * hinting "there's more here", plus an exact-count badge.
 */
export function DiscardPile({ cards, zoneKey }: DiscardPileProps) {
  const { registerZoneRef } = useCardFlight();
  const topCard = cards[cards.length - 1];
  const underLayerCount = Math.min(cards.length - 1, MAX_UNDER_LAYERS);

  return (
    <div>
      <div className={styles.pile}>
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
        {topCard && (
          <div ref={registerZoneRef(zoneKey)} className={styles.layer}>
            <img
              className={styles.layerImage}
              src={assetUrl(pickVariant(topCard, getCardDef(topCard.defId).imagePaths))}
              alt={getCardDef(topCard.defId).name}
            />
          </div>
        )}
        {cards.length > 0 && <span className={styles.badge}>{cards.length}</span>}
      </div>
      <div className={styles.label}>Dobott lapok</div>
    </div>
  );
}
