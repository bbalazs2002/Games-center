import { assetUrl } from '../../../../core/assetUrl';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import type { CardInstance } from '../../../../../shared/games/gwent/engine/state';
import type { CardDef } from '../../../../../shared/games/gwent/engine/types';
import { pickVariant } from './CardTile';
import { useCardFlight } from './cardFlight';
import styles from './DiscardPile.module.css';
import matchBoardStyles from './matchBoard.module.css';

const MAX_UNDER_LAYERS = 2;
const LAYER_OFFSET_PX = 2;

export interface DiscardPileProps {
  cards: CardInstance[];
  /** Registry key for the card-flight system, e.g. `discard:player-1`. */
  zoneKey: string;
  /** Opens a read-only full-size view of the top (only visible) discarded card — both players' discard piles are zoomable (Gwent-0c.1 §C, 13. pont). */
  onZoomCard?: (def: CardDef) => void;
}

/**
 * The dobott lapok kupaca — always public (Gwent-0b: discard is never
 * masked), so unlike DeckPile this shows the LEGITIMATE top card's real
 * face (the array's last element — every discard push appends, see rules.ts
 * destroyStrongestAcross/reducer.ts), plus a couple of dimmed under-layers
 * hinting "there's more here", plus an exact-count badge.
 */
export function DiscardPile({ cards, zoneKey, onZoomCard }: DiscardPileProps) {
  const { registerZoneRef } = useCardFlight();
  const topCard = cards[cards.length - 1];
  const topCardDef = topCard ? getCardDef(topCard.defId) : null;
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
        {topCard && topCardDef && (
          <div ref={registerZoneRef(zoneKey)} className={styles.layer}>
            <img className={styles.layerImage} src={assetUrl(pickVariant(topCard, topCardDef.imagePaths))} alt={topCardDef.name} />
            {onZoomCard && (
              <span
                role="button"
                tabIndex={0}
                className={matchBoardStyles.zoomButton}
                aria-label="Lap nagyítása"
                onClick={(event) => {
                  event.stopPropagation();
                  onZoomCard(topCardDef);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  event.stopPropagation();
                  onZoomCard(topCardDef);
                }}
              >
                🔍
              </span>
            )}
          </div>
        )}
        {cards.length > 0 && <span className={styles.badge}>{cards.length}</span>}
      </div>
      <div className={styles.label}>Dobott lapok</div>
    </div>
  );
}
