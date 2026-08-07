import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { assetUrl } from '../../../../core/assetUrl';
import { getCardDef } from '@shared/games/gwent/engine/cardDefs';
import { HIDDEN_CARD_DEF_ID } from '@shared/games/gwent/engine/specialCardIds';
import type { CardInstance } from '@shared/games/gwent/engine/state';
import type { Faction } from '@shared/games/gwent/engine/types';
import { pickVariant } from './cardArtVariant';
import { CARD_BACK_PATHS, DEFAULT_CARD_BACK_PATH } from './cardBackPaths';
import styles from './matchBoard.module.css';

export interface CardTileProps {
  instance: CardInstance;
  /** Omitted for non-unit cards (weather/decoy/horn/scorch never show a power badge). Only rendered as a supplementary overlay at `size="small"`/`"deckBuilder"` — the card art's own burned-in power badge is already legible at medium/large (Gwent-0d §1). */
  power?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** 'fill' fills its container (100%/100%) instead of a fixed size — used by the card-flight ghost overlay, whose wrapper size is itself animated. 'large' is the mulligan screen only (Gwent-0c.2 §I, 10. pont). 'deckBuilder' is the same top-cropped look as 'small' (Gwent-0d §1), just bigger — DeckStep's Gyűjtemény/Pakliban grids only, kept separate from 'small' so the match-board row density stays untouched. */
  size?: 'small' | 'medium' | 'large' | 'fill' | 'deckBuilder';
  /** Only meaningful when the instance is masked (hidden) — picks the owner's faction card-back art. Falls back to the generic back if omitted. */
  faction?: Faction;
  /** Kept mounted (preserves layout + ref registration) but visually invisible — used while a card-flight ghost is covering this exact instance, see cardFlight.tsx. */
  hidden?: boolean;
  /**
   * A highlight for "this card may be picked as a target right now" (e.g. a
   * Decoy swap target) — deliberately NOT the same visual as `disabled`
   * (Gwent-0c.1 §D: board cards must never fade just because they aren't
   * clickable at this exact instant).
   */
  targetable?: boolean;
  /** Gwent-0c.2 §L: the hand-card fan applies a per-tile negative margin-left computed from the actual container width, so cards overlap only as much as needed to fit without wrapping. */
  style?: CSSProperties;
}

type CardTileSize = NonNullable<CardTileProps['size']>;

/** Extracted purely to keep `CardTile` itself under the project's complexity-10 ESLint limit — each `&&` here used to count against that one function. */
function cardTileClassName(
  size: CardTileSize,
  selected: boolean | undefined,
  disabled: boolean | undefined,
  targetable: boolean | undefined,
  hidden: boolean | undefined,
  clickable: boolean,
): string {
  return [
    styles.cardTile,
    styles[size],
    selected && styles.cardSelected,
    disabled && styles.cardDisabled,
    targetable && styles.cardTargetable,
    clickable && styles.cardClickable,
    hidden && styles.cardFlightHidden,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Gwent-0d §1/§4: the burned-in power badge on the card art is only reliably legible at "medium"/"large" scale — this supplementary overlay covers "small" (board) and the bigger "deckBuilder" (collection/deck grids) crops, the latter with a bigger badge (`cardPowerLarge`). */
function PowerBadge({ power, size }: { power: number | undefined; size: CardTileSize }): ReactNode {
  if (power === undefined || (size !== 'small' && size !== 'deckBuilder')) return null;
  const className = [styles.cardPower, size === 'deckBuilder' && styles.cardPowerLarge].filter(Boolean).join(' ');
  return <span className={className}>{power}</span>;
}

function hiddenCardBackPath(faction: Faction | undefined): string {
  return faction ? CARD_BACK_PATHS[faction] : DEFAULT_CARD_BACK_PATH;
}

/**
 * `forwardRef`-based (not a plain function) so `TrackedCardTile`
 * (cardFlight.tsx) can register this exact DOM node's rect with the shared
 * card-flight registry without an extra wrapper element — a wrapper div
 * would otherwise interfere with the flex/grid gap layout of HandArea/BoardRow.
 */
export const CardTile = forwardRef<HTMLButtonElement, CardTileProps>(function CardTile(
  { instance, power, selected, disabled, onClick, size = 'small', faction, hidden, targetable, style },
  ref,
) {
  const isHidden = instance.defId === HIDDEN_CARD_DEF_ID;
  const className = cardTileClassName(size, selected, disabled, targetable, hidden, !!onClick);
  const isDisabled = disabled || !onClick;

  // A masked CardInstance (Gwent-0b, see toPublicGwentState) — never a real
  // catalog entry, so getCardDef must never be called on it.
  if (isHidden) {
    return (
      <button ref={ref} type="button" style={style} className={className} onClick={onClick} disabled={isDisabled} title="Rejtett lap">
        <img className={styles.cardImage} src={hiddenCardBackPath(faction)} alt="Rejtett lap" />
      </button>
    );
  }

  const def = getCardDef(instance.defId);
  const imagePath = pickVariant(instance, def.imagePaths);

  return (
    <button ref={ref} type="button" style={style} className={className} onClick={onClick} disabled={isDisabled} title={def.name}>
      <img className={styles.cardImage} src={assetUrl(imagePath)} alt={def.name} />
      <PowerBadge power={power} size={size} />
    </button>
  );
});
