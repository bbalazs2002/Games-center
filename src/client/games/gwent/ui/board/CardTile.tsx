import { forwardRef, type CSSProperties } from 'react';
import { assetUrl } from '../../../../core/assetUrl';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import { HIDDEN_CARD_DEF_ID } from '../../../../../shared/games/gwent/engine/specialCardIds';
import type { CardInstance } from '../../../../../shared/games/gwent/engine/state';
import type { Faction } from '../../../../../shared/games/gwent/engine/types';
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
  { instance, power, selected, disabled, onClick, size = 'small', faction, hidden, targetable, style },
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

  // A masked CardInstance (Gwent-0b, see toPublicGwentState) — never a real
  // catalog entry, so getCardDef must never be called on it.
  if (isHidden) {
    const backPath = faction ? CARD_BACK_PATHS[faction] : DEFAULT_CARD_BACK_PATH;
    return (
      <button ref={ref} type="button" style={style} className={className} onClick={onClick} disabled={disabled || !onClick} title="Rejtett lap">
        <img className={styles.cardImage} src={backPath} alt="Rejtett lap" />
      </button>
    );
  }

  const def = getCardDef(instance.defId);
  const imagePath = pickVariant(instance, def.imagePaths);

  return (
    <button ref={ref} type="button" style={style} className={className} onClick={onClick} disabled={disabled || !onClick} title={def.name}>
      <img className={styles.cardImage} src={assetUrl(imagePath)} alt={def.name} />
      {/* Gwent-0d §1: only at cropped-top scale ("small"/"deckBuilder") — the burned-in power badge is already legible at medium/large. Gwent-0d §4 korrekció (2026-08-07): bigger at "deckBuilder" scale (`cardPowerLarge`) — the felhasználó found the board-sized badge too small in the collection/deck grids. */}
      {power !== undefined && (size === 'small' || size === 'deckBuilder') && (
        <span className={[styles.cardPower, size === 'deckBuilder' && styles.cardPowerLarge].filter(Boolean).join(' ')}>{power}</span>
      )}
    </button>
  );
});
