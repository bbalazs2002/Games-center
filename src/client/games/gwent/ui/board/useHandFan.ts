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
  // Gwent-0c.4 §8: true only in the genuinely rare case where even the MAX
  // allowed overlap still doesn't fit — HandArea uses this to gate
  // `overflow-x: auto` (a scrolling container clips the selected-card
  // scale-up, see matchBoard.module.css .cardSelected). Kept `visible` the
  // rest of the time so that transform has somewhere to spill into.
  const [needsScroll, setNeedsScroll] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || cardCount <= 1) {
      setOverlapPx(0);
      setNeedsScroll(false);
      return;
    }
    const firstCard = container.firstElementChild as HTMLElement | null;
    if (!firstCard) {
      setOverlapPx(0);
      setNeedsScroll(false);
      return;
    }
    const cardWidthPx = firstCard.getBoundingClientRect().width;
    const availableWidth = container.clientWidth;
    const naturalTotalWidth = cardWidthPx * cardCount;
    if (naturalTotalWidth <= availableWidth) {
      setOverlapPx(0);
      setNeedsScroll(false);
      return;
    }
    const neededOverlap = cardWidthPx - (availableWidth - cardWidthPx) / (cardCount - 1);
    const maxOverlap = Math.max(cardWidthPx - minVisiblePx, 0);
    setOverlapPx(Math.min(Math.max(neededOverlap, 0), maxOverlap));
    setNeedsScroll(neededOverlap > maxOverlap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardCount]);

  return { containerRef, overlapPx, needsScroll };
}
