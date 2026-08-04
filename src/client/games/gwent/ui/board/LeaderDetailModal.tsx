import { assetUrl } from '../../../../core/assetUrl';
import { Modal } from '../../../../ui-kit/Modal';
import { useGameTheme } from '../../../../shell/useGameTheme';
import type { LeaderDef } from '../../../../../shared/games/gwent/engine/types';
import styles from '../CardDetailModal.module.css';
import themedModal from '../../../../ui-kit/themedModalContent.module.css';

export interface LeaderDetailModalProps {
  leader: LeaderDef | null;
  onClose: () => void;
}

/**
 * Full-size leader-card view — the vezér-kártya equivalent of CardDetailModal
 * (Gwent-0c.1 §C, 10. pont: zoomable even while passive/already used).
 * Reuses CardDetailModal's own CSS module for a visually identical layout
 * (LeaderDef has a different shape than CardDef, so it can't share the
 * component itself — no `basePower`/`row`/`abilities`/`kind`).
 */
export function LeaderDetailModal({ leader, onClose }: LeaderDetailModalProps) {
  const themeClass = useGameTheme('gwent');
  return (
    <Modal open={leader !== null} onClose={onClose} className={[themedModal.themed, themeClass].filter(Boolean).join(' ')}>
      {leader && (
        <div className={styles.detail}>
          <img className={styles.image} src={assetUrl(leader.imagePaths[0])} alt={leader.name} />
          <div className={styles.info}>
            <h2 className={styles.name}>{leader.name}</h2>
            <dl className={styles.factsList}>
              <div className={styles.fact}>
                <dt>Frakció</dt>
                <dd>{leader.faction}</dd>
              </div>
            </dl>
            <p className={styles.mechanicText}>{leader.abilityDescription}</p>
            {leader.cardText && (
              <div>
                <div className={styles.cardTextLabel}>Eredeti szöveg (angol)</div>
                <blockquote className={styles.cardText} lang="en">
                  {leader.cardText}
                </blockquote>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
