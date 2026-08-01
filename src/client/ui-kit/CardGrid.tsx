import type { ReactNode } from 'react';
import styles from './CardGrid.module.css';

export interface CardGridProps<T> {
  items: T[];
  getKey: (item: T) => string;
  getImageUrl: (item: T) => string | undefined;
  getLabel: (item: T) => string;
  getSubtitle?: (item: T) => ReactNode;
  isSelected?: (item: T) => boolean;
  isDisabled?: (item: T) => boolean;
  onSelect?: (item: T) => void;
  /** Extra content pinned to the tile's top-right corner — e.g. a deck-builder quantity stepper. */
  renderBadge?: (item: T) => ReactNode;
  /** Extra content pinned to the tile's top-left corner — e.g. a "view details" magnifier button. */
  renderCorner?: (item: T) => ReactNode;
  className?: string;
}

/**
 * Generic responsive grid of clickable image tiles — deliberately game-agnostic
 * (no Gwent-specific typing) so it can be reused for any future "pick one/many
 * of a static, image-backed catalog" screen (faction picker, leader picker,
 * card browser today; future card-driven games later). Layout only — callers
 * own what a tile's data/selection/badge means.
 */
export function CardGrid<T>({
  items,
  getKey,
  getImageUrl,
  getLabel,
  getSubtitle,
  isSelected,
  isDisabled,
  onSelect,
  renderBadge,
  renderCorner,
  className,
}: CardGridProps<T>) {
  return (
    <div className={[styles.grid, className].filter(Boolean).join(' ')}>
      {items.map((item) => {
        const key = getKey(item);
        const selected = isSelected?.(item) ?? false;
        const disabled = isDisabled?.(item) ?? false;
        const imageUrl = getImageUrl(item);
        // A plain, focusable div (not <button>) — `renderBadge` may itself render
        // interactive buttons (e.g. a deck-builder quantity stepper), and a
        // <button> can never legally contain another <button>.
        return (
          <div
            key={key}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            aria-pressed={selected}
            className={[styles.tile, selected ? styles.selected : '', disabled ? styles.disabled : ''].filter(Boolean).join(' ')}
            onClick={() => !disabled && onSelect?.(item)}
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect?.(item);
              }
            }}
          >
            {renderBadge && <div className={styles.badge}>{renderBadge(item)}</div>}
            {renderCorner && <div className={styles.corner}>{renderCorner(item)}</div>}
            <div className={styles.imageWrap}>
              {imageUrl ? <img className={styles.image} src={imageUrl} alt={getLabel(item)} loading="lazy" /> : null}
            </div>
            <div className={styles.label}>{getLabel(item)}</div>
            {getSubtitle && <div className={styles.subtitle}>{getSubtitle(item)}</div>}
          </div>
        );
      })}
    </div>
  );
}
