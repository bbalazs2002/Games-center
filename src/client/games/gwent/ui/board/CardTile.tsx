import { forwardRef } from 'react';
import { assetUrl } from '../../../../core/assetUrl';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import { HIDDEN_CARD_DEF_ID } from '../../../../../shared/games/gwent/engine/specialCardIds';
import type { CardInstance } from '../../../../../shared/games/gwent/engine/state';
import type { Faction } from '../../../../../shared/games/gwent/engine/types';
import { CARD_BACK_PATHS, DEFAULT_CARD_BACK_PATH } from './cardBackPaths';
import styles from './matchBoard.module.css';

export interface CardTileProps {
  instance: CardInstance;
  /** Omitted for non-unit cards (weather/decoy/horn/scorch never show a power badge). */
  power?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** 'fill' fills its container (100%/100%) instead of a fixed size — used by the card-flight ghost overlay, whose wrapper size is itself animated. */
  size?: 'small' | 'medium' | 'fill';
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
  /** Renders a small 🔍 corner button that opens a read-only full-size view — never fires `onClick` (Gwent-0c.1 §C). */
  onZoom?: () => void;
}

/** Deterministic art-variant pick (spec §5.2) — same instanceId always renders the same variant within one session. Exported for DiscardPile's own top-card rendering (Gwent-0c). */
export function pickVariant(instance: CardInstance, imagePaths: string[]): string {
  if (imagePaths.length <= 1) return imagePaths[0];
  let hash = 0;
  for (let i = 0; i < instance.instanceId.length; i += 1) hash = (hash * 31 + instance.instanceId.charCodeAt(i)) >>> 0;
  return imagePaths[hash % imagePaths.length];
}

/**
 * `forwardRef`-based (not a plain function) so `TrackedCardTile`
 * (cardFlight.tsx) can register this exact DOM node's rect with the shared
 * card-flight registry without an extra wrapper element — a wrapper div
 * would otherwise interfere with the flex/grid gap layout of HandArea/BoardRow.
 */
export const CardTile = forwardRef<HTMLButtonElement, CardTileProps>(function CardTile(
  { instance, power, selected, disabled, onClick, size = 'small', faction, hidden, targetable, onZoom },
  ref,
) {
  const isHidden = instance.defId === HIDDEN_CARD_DEF_ID;
  const className = [
    styles.cardTile,
    styles[size],
    selected && styles.cardSelected,
    disabled && styles.cardDisabled,
    targetable && styles.cardTargetable,
    onClick && styles.cardClickable,
    hidden && styles.cardFlightHidden,
  ]
    .filter(Boolean)
    .join(' ');

  // A <span role="button">, NOT a nested <button> — CardTile's own root is
  // already a <button>, and a <button> can never legally contain another
  // <button> (same constraint CardGrid.tsx's own tiles work around).
  const zoomButton = onZoom && !isHidden && (
    <span
      role="button"
      tabIndex={0}
      className={styles.zoomButton}
      aria-label="Lap nagyítása"
      onClick={(event) => {
        event.stopPropagation();
        onZoom();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onZoom();
      }}
    >
      🔍
    </span>
  );

  // A masked CardInstance (Gwent-0b, see toPublicGwentState) — never a real
  // catalog entry, so getCardDef must never be called on it.
  if (isHidden) {
    const backPath = faction ? CARD_BACK_PATHS[faction] : DEFAULT_CARD_BACK_PATH;
    return (
      <button ref={ref} type="button" className={className} onClick={onClick} disabled={disabled || !onClick} title="Rejtett lap">
        <img className={styles.cardImage} src={backPath} alt="Rejtett lap" />
      </button>
    );
  }

  const def = getCardDef(instance.defId);
  const imagePath = pickVariant(instance, def.imagePaths);
  // A native `disabled` button blocks pointer events on its ENTIRE subtree
  // (a browser-level rule CSS can't override) — so a card with only a zoom
  // trigger and no onClick (e.g. a board card outside decoy-picking) must
  // stay enabled, or the nested zoom button becomes permanently inert.
  const isDisabled = disabled || (!onClick && !onZoom);

  return (
    <button ref={ref} type="button" className={className} onClick={onClick} disabled={isDisabled} title={def.name}>
      <img className={styles.cardImage} src={assetUrl(imagePath)} alt={def.name} />
      {power !== undefined && <span className={styles.cardPower}>{power}</span>}
      {zoomButton}
    </button>
  );
});
