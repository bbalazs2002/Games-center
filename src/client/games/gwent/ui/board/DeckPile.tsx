import { CARD_BACK_PATHS } from './cardBackPaths';
import { useCardFlight } from './useCardFlight';
import type { Faction } from '../../../../../shared/games/gwent/engine/types';
import styles from './DeckPile.module.css';

const MAX_VISUAL_LAYERS = 5;
const LAYER_OFFSET_PX = 2;

export interface DeckPileProps {
  count: number;
  faction: Faction;
  /** Registry key for the card-flight system, e.g. `deck:player-1`. */
  zoneKey: string;
}

/**
 * The húzópakli — always masked (Gwent-0b: nobody, not even the owner, sees
 * a deck's contents/order), so this renders purely from `count`: a capped
 * stack of card-back layers (so "1 card" vs. "20 cards" reads differently at
 * a glance without drawing 20 DOM nodes) + an exact-count badge. The
 * topmost layer's own rect is what registers as the `zoneKey` flight anchor
 * (not the whole stack's bounding box), so a drawn card flies from
 * roughly where a single card would sit.
 */
export function DeckPile({ count, faction, zoneKey }: DeckPileProps) {
  const { registerZoneRef } = useCardFlight();
  const backPath = CARD_BACK_PATHS[faction];
  const visibleLayers = Math.min(count, MAX_VISUAL_LAYERS);

  return (
    <div>
      <div className={styles.pile}>
        {count === 0 && <div className={styles.empty}>üres</div>}
        {Array.from({ length: visibleLayers }, (_, i) => {
          const isTop = i === visibleLayers - 1;
          return (
            <div
              key={i}
              ref={isTop ? registerZoneRef(zoneKey) : undefined}
              className={styles.layer}
              style={{ transform: `translate(${i * LAYER_OFFSET_PX}px, ${-i * LAYER_OFFSET_PX}px)` }}
            >
              <img className={styles.layerImage} src={backPath} alt="Húzópakli" />
            </div>
          );
        })}
        {count > 0 && <span className={styles.badge}>{count}</span>}
      </div>
      <div className={styles.label}>Pakli</div>
    </div>
  );
}
