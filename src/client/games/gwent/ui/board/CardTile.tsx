import { assetUrl } from '../../../../core/assetUrl';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import { HIDDEN_CARD_DEF_ID } from '../../../../../shared/games/gwent/engine/specialCardIds';
import type { CardInstance } from '../../../../../shared/games/gwent/engine/state';
import styles from './matchBoard.module.css';

export interface CardTileProps {
  instance: CardInstance;
  /** Omitted for non-unit cards (weather/decoy/horn/scorch never show a power badge). */
  power?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'small' | 'medium';
}

/** Deterministic art-variant pick (spec §5.2) — same instanceId always renders the same variant within one session. */
function pickVariant(instance: CardInstance, imagePaths: string[]): string {
  if (imagePaths.length <= 1) return imagePaths[0];
  let hash = 0;
  for (let i = 0; i < instance.instanceId.length; i += 1) hash = (hash * 31 + instance.instanceId.charCodeAt(i)) >>> 0;
  return imagePaths[hash % imagePaths.length];
}

export function CardTile({ instance, power, selected, disabled, onClick, size = 'small' }: CardTileProps) {
  const isHidden = instance.defId === HIDDEN_CARD_DEF_ID;
  const className = [styles.cardTile, styles[size], selected && styles.cardSelected, disabled && styles.cardDisabled, onClick && styles.cardClickable]
    .filter(Boolean)
    .join(' ');

  // A masked CardInstance (Gwent-0b, see toPublicGwentState) — never a real
  // catalog entry, so getCardDef must never be called on it. No dedicated
  // card-back art exists yet (only box.png + the 2 coin icons under
  // assets/gwent/icons/) — this CSS placeholder is a stand-in, same
  // "final look isn't this round's scope" stance as the rest of the board UI.
  if (isHidden) {
    return (
      <button type="button" className={[className, styles.cardBack].join(' ')} onClick={onClick} disabled={disabled || !onClick} title="Rejtett lap">
        <span className={styles.cardBackMark}>?</span>
      </button>
    );
  }

  const def = getCardDef(instance.defId);
  const imagePath = pickVariant(instance, def.imagePaths);

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled || !onClick} title={def.name}>
      <img className={styles.cardImage} src={assetUrl(imagePath)} alt={def.name} />
      {power !== undefined && <span className={styles.cardPower}>{power}</span>}
    </button>
  );
}
