import type { ReactNode } from 'react';
import { assetUrl } from '../../../core/assetUrl';
import { Modal } from '../../../ui-kit/Modal';
import { useGameTheme } from '../../../shell/useGameTheme';
import { CARD_TEXT_HU } from '../../../../shared/games/gwent/engine/cardTextTranslations';
import type { CardDef } from '../../../../shared/games/gwent/engine/types';
import type { CardInstance } from '../../../../shared/games/gwent/engine/state';
import { ABILITY_DESCRIPTIONS_HU, ABILITY_LABELS_HU, CARD_KIND_LABELS_HU, cardMechanicLine, cardMechanicTag, rowLabel } from './cardDisplay';
import { pickVariant } from './board/CardTile';
import styles from './CardDetailModal.module.css';
import themedModal from '../../../ui-kit/themedModalContent.module.css';

export interface CardDetailModalProps {
  card: CardDef | null;
  /**
   * The exact instance being zoomed, if known — picks the SAME art variant
   * the small tile already shows (`pickVariant`, same hash-of-instanceId
   * logic) instead of always `card.imagePaths[0]` (Gwent-0c.2 §H, 9. pont:
   * a real bug found live — a multi-art card's tile and its zoom could show
   * different pictures). Omitted only by the deck-builder's own
   * CardCountGrid, which browses the catalog itself, not live instances.
   */
  instance?: CardInstance;
  onClose: () => void;
  /**
   * Gwent-0c.1 §C: lets a caller turn this read-only detail view into a
   * confirm-before-committing step (hand-card play preview, mulligan-swap
   * preview) by injecting action buttons below the card facts, instead of
   * duplicating this whole layout for that one extra row of buttons.
   */
  footer?: ReactNode;
}

/** Full-size, single-card detail view opened by a tile's magnifier button (0a-spec kérés 2026-08-01/5). */
export function CardDetailModal({ card, instance, onClose, footer }: CardDetailModalProps) {
  const themeClass = useGameTheme('gwent');
  const imagePath = card ? (instance ? pickVariant(instance, card.imagePaths) : card.imagePaths[0]) : undefined;
  const flavorHu = card ? CARD_TEXT_HU[card.id] : undefined;
  const mechanicLine = card ? cardMechanicLine(card) : null;
  // Gwent-0c.3 §3: RowScorch/specialText belongs in the SAME right-side panel
  // as ability explanations, not inline in the main column — a real report
  // (Schirrú's Sor felperzselés explanation wasn't showing there at all,
  // since the panel used to only appear for `abilities.length > 0`).
  const hasMechanicsPanel = !!card && (card.abilities.length > 0 || mechanicLine !== null);
  return (
    <Modal
      open={card !== null}
      onClose={onClose}
      className={[themedModal.themed, themeClass, styles.wideModal].filter(Boolean).join(' ')}
    >
      {card && imagePath && (
        <div className={styles.detail}>
          <img className={styles.image} src={assetUrl(imagePath)} alt={card.name} />
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
                <dd>{CARD_KIND_LABELS_HU[card.kind]}</dd>
              </div>
              {card.abilities.length > 0 && (
                <div className={styles.fact}>
                  <dt>Képességek</dt>
                  <dd>{card.abilities.map((a) => ABILITY_LABELS_HU[a]).join(', ')}</dd>
                </div>
              )}
            </dl>
            {flavorHu && (
              <blockquote className={styles.cardText} lang="hu">
                {flavorHu}
              </blockquote>
            )}
            {footer && <div className={styles.footer}>{footer}</div>}
          </div>
          {hasMechanicsPanel && (
            <div className={styles.abilitiesPanel}>
              <p className={styles.abilitiesPanelTitle}>Képességek magyarázata</p>
              {card.abilities.map((a) => (
                <p key={a} className={styles.abilityEntry}>
                  <strong>{ABILITY_LABELS_HU[a]}</strong>
                  {ABILITY_DESCRIPTIONS_HU[a]}
                </p>
              ))}
              {mechanicLine && (
                <p className={styles.abilityEntry}>
                  <strong>{cardMechanicTag(card)}</strong>
                  {mechanicLine}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
