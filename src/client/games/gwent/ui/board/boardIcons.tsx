/**
 * Small monochrome (`currentColor`) status icons for the match board, in
 * place of colorful emoji (Gwent-0c.3 §8: "a kupa, szumma és ilyen ikonok
 * mind legyenek monochrome, egyszerű ikonok"). Same style as
 * CardCountGrid.tsx's magnifier icon — plain stroke-based SVG, no fill,
 * scales cleanly with font-size via `em`-sized width/height.
 */

export function TrophyIcon() {
  return (
    <svg width="0.9em" height="0.9em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4h8v6a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H4v2a4 4 0 0 0 4 4" />
      <path d="M16 5h4v2a4 4 0 0 1-4 4" />
      <path d="M12 14v3" />
      <path d="M9 20h6" />
      <path d="M10 17h4l1 3H9l1-3Z" />
    </svg>
  );
}

export function HandCardsIcon() {
  return (
    <svg width="0.9em" height="0.9em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="7" height="12" rx="1" />
      <rect x="14" y="6" width="7" height="12" rx="1" transform="rotate(8 17.5 12)" />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg width="0.9em" height="0.9em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * Gwent-0d §3, korrekció (referencia-kép egyeztetés): a player-info panel
 * generikus profilképe — a referencia egy tömör, egyszínű sziluettet mutat
 * (nem vonalrajzot), ezért ez SOLID fill, nem stroke — nincs valódi
 * fénykép-funkció, minden játékos ugyanezt a sziluettet kapja.
 */
export function PersonIcon() {
  return (
    <svg width="1.6em" height="1.6em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="8.2" r="4.2" />
      <path d="M4 21c0-4.7 3.6-8.5 8-8.5s8 3.8 8 8.5Z" />
    </svg>
  );
}

/**
 * Gwent-0d §3: wraps the score badge when this side currently has the
 * higher round-total (`computeSideTotal`) — two mirrored leaf branches along
 * a shallow arc, positioned `absolute; inset: 0` behind the score number by
 * the caller (a decorative motif, not a pixel-exact replica).
 */
export function LaurelWreathIcon() {
  return (
    <svg viewBox="0 0 100 60" fill="currentColor" aria-hidden="true">
      <g>
        <path d="M12 55 Q2 35 12 15 Q17 26 23 31 Q17 36 21 46 Q15 51 12 55Z" opacity="0.85" />
        <ellipse cx="16" cy="21" rx="4" ry="7.5" transform="rotate(-30 16 21)" />
        <ellipse cx="9" cy="31" rx="4" ry="7.5" transform="rotate(-8 9 31)" />
        <ellipse cx="12" cy="43" rx="4" ry="7.5" transform="rotate(18 12 43)" />
      </g>
      <g transform="translate(100,0) scale(-1,1)">
        <path d="M12 55 Q2 35 12 15 Q17 26 23 31 Q17 36 21 46 Q15 51 12 55Z" opacity="0.85" />
        <ellipse cx="16" cy="21" rx="4" ry="7.5" transform="rotate(-30 16 21)" />
        <ellipse cx="9" cy="31" rx="4" ry="7.5" transform="rotate(-8 9 31)" />
        <ellipse cx="12" cy="43" rx="4" ry="7.5" transform="rotate(18 12 43)" />
      </g>
    </svg>
  );
}
