import { assetUrl } from '../../../core/assetUrl';
import { ROW_LABELS_HU } from '@shared/games/gwent/engine/cardDisplay';
import type { Row } from '@shared/games/gwent/engine/types';

/**
 * Same medallion art as BoardRow.tsx's row header (Gwent-0d §3) — reused
 * here so the deck-builder tile's row marker is an icon, not a text pill
 * (Gwent-0d §4 korrekció, 2026-08-07). Stays client-side (unlike the rest of
 * the former cardDisplay.ts, now `@shared/games/gwent/engine/cardDisplay`)
 * because `assetUrl()` is a browser/Vite-only concern — the project's
 * one-directional dependency rule (shared never imports client/server) means
 * anything that touches it can't live in `shared`.
 */
export const ROW_ICON_PATH: Record<Row, string> = {
  Melee: assetUrl('/assets/gwent/icons/melee.png'),
  Ranged: assetUrl('/assets/gwent/icons/ranged.png'),
  Siege: assetUrl('/assets/gwent/icons/siege.png'),
};

/** DeckStep.tsx's row-icon overlay, bundled as one lookup instead of two separate `def.row ? … : null` branches — icon and label are always in sync (both derive from the same `Row | null`), so callers get a single non-null/null result instead of juggling two independently-nullable values. */
export function rowBadge(row: Row | null): { icon: string; label: string } | null {
  if (!row) return null;
  return { icon: ROW_ICON_PATH[row], label: ROW_LABELS_HU[row] };
}
