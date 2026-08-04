import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Computes the negative `margin-left` (px) every card-but-the-first needs so
 * a variable-size hand (Gwent-0c.2 §L/§O': up to ~15 cards is the expected
 * ceiling, more is rare but must not break) always fits in ONE row without
 * wrapping — a physical card-fan, not a multi-row grid. Falls back to 0 (no
 * overlap) whenever the hand already fits at natural size. `cardWidthPx` is
 * read from the actual first tile's rendered width (not hard-coded), so it
 * stays correct if the CSS card size ever changes.
 */
export function useHandFan(cardCount: number, minVisiblePx: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [overlapPx, setOverlapPx] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || cardCount <= 1) {
      setOverlapPx(0);
      return;
    }
    const firstCard = container.firstElementChild as HTMLElement | null;
    if (!firstCard) {
      setOverlapPx(0);
      return;
    }
    const cardWidthPx = firstCard.getBoundingClientRect().width;
    const availableWidth = container.clientWidth;
    const naturalTotalWidth = cardWidthPx * cardCount;
    if (naturalTotalWidth <= availableWidth) {
      setOverlapPx(0);
      return;
    }
    const neededOverlap = cardWidthPx - (availableWidth - cardWidthPx) / (cardCount - 1);
    const maxOverlap = Math.max(cardWidthPx - minVisiblePx, 0);
    setOverlapPx(Math.min(Math.max(neededOverlap, 0), maxOverlap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardCount]);

  return { containerRef, overlapPx };
}
