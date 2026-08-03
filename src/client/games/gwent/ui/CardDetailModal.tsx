import { assetUrl } from '../../../core/assetUrl';
import { Modal } from '../../../ui-kit/Modal';
import type { CardDef } from '../../../../shared/games/gwent/engine/types';
import { cardMechanicLine, rowLabel } from './cardDisplay';
import styles from './CardDetailModal.module.css';

export interface CardDetailModalProps {
  card: CardDef | null;
  onClose: () => void;
}

/** Full-size, single-card detail view opened by a tile's magnifier button (0a-spec kérés 2026-08-01/5). */
export function CardDetailModal({ card, onClose }: CardDetailModalProps) {
  return (
    <Modal open={card !== null} onClose={onClose}>
      {card && (
        <div className={styles.detail}>
          <img className={styles.image} src={assetUrl(card.imagePaths[0])} alt={card.name} />
          <div className={styles.info}>
            <h2 className={styles.name}>{card.name}</h2>
            <dl className={styles.factsList}>
              {card.basePower !== null && (
                <div className={styles.fact}>
                  <dt>Erő</dt>
                  <dd>{card.basePower}</dd>
                </div>
              )}
              {rowLabel(card.row) && (
                <div className={styles.fact}>
                  <dt>Sor</dt>
                  <dd>{rowLabel(card.row)}</dd>
                </div>
              )}
              <div className={styles.fact}>
                <dt>Típus</dt>
                <dd>{card.kind}</dd>
              </div>
              {card.abilities.length > 0 && (
                <div className={styles.fact}>
                  <dt>Képességek</dt>
                  <dd>{card.abilities.join(', ')}</dd>
                </div>
              )}
            </dl>
            {cardMechanicLine(card) && <p className={styles.mechanicText}>{cardMechanicLine(card)}</p>}
            {card.cardText && (
              <div>
                <div className={styles.cardTextLabel}>Eredeti szöveg (angol)</div>
                <blockquote className={styles.cardText} lang="en">
                  {card.cardText}
                </blockquote>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
