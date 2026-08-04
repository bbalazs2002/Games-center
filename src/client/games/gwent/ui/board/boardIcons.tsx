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
