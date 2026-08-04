import { assetUrl } from '../../../../core/assetUrl';
import { Modal } from '../../../../ui-kit/Modal';
import { useGameTheme } from '../../../../shell/useGameTheme';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import type { CardInstance } from '../../../../../shared/games/gwent/engine/state';
import { pickVariant } from './CardTile';
import styles from './DiscardPileModal.module.css';
import themedModal from '../../../../ui-kit/themedModalContent.module.css';

export interface DiscardPileModalProps {
  /** null = closed. An empty array never actually opens (DiscardPile only wires onOpenAll when it has cards). */
  cards: CardInstance[] | null;
  onClose: () => void;
}

/** The full contents of one discard pile, as a card grid (Gwent-0c.2 §O, 17. pont) — replaces the old single-top-card magnifier zoom; discard is never masked (Gwent-0b), so both players' piles work identically. */
export function DiscardPileModal({ cards, onClose }: DiscardPileModalProps) {
  const themeClass = useGameTheme('gwent');
  return (
    <Modal open={cards !== null} onClose={onClose} className={[themedModal.themed, themeClass].filter(Boolean).join(' ')}>
      <h2 className={styles.title}>Dobott lapok ({cards?.length ?? 0})</h2>
      <div className={styles.grid}>
        {(cards ?? []).map((instance) => {
          const def = getCardDef(instance.defId);
          return (
            <div key={instance.instanceId} className={styles.tile} title={def.name}>
              <img className={styles.image} src={assetUrl(pickVariant(instance, def.imagePaths))} alt={def.name} />
              <span className={styles.name}>{def.name}</span>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
