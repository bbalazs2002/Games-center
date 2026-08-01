import type { CardDef, Row } from '../../../../shared/games/gwent/engine/types';

export const ROW_LABELS_HU: Record<Row, string> = {
  Melee: 'Közelharc',
  Ranged: 'Távolsági',
  Siege: 'Ostrom',
};

export function rowLabel(row: Row | null): string | null {
  return row === null ? null : ROW_LABELS_HU[row];
}

/** Short line shown under a card tile: power + row (units), or kind (specials). */
export function cardSummaryLine(def: CardDef): string {
  const parts: string[] = [];
  if (def.basePower !== null) parts.push(String(def.basePower));
  if (def.abilities.length > 0) parts.push(def.abilities.join(', '));
  if (def.kind !== 'Unit') parts.push(def.kind);
  return parts.join(' · ');
}

/** Second line shown under a card tile: the row it belongs to, if any (0a-spec kérés 2026-08-01/7). */
export function cardRowLine(def: CardDef): string | null {
  const label = rowLabel(def.row);
  return label ? `Sor: ${label}` : null;
}

/** Human-readable one-liner for a card's unique mechanic (RowScorch or the freeform specialText), if it has one. */
export function cardMechanicLine(def: CardDef): string | null {
  if (def.rowScorch) {
    return `Sor felperzselés: elpusztítja az ellenfél ${ROW_LABELS_HU[def.rowScorch.targetRow]} sorának legerősebb kártyáját/kártyáit, ha annak össz-ereje eléri a ${def.rowScorch.threshold}-et.`;
  }
  return def.specialText;
}

/** Short badge-sized tag for a card tile — the full explanation lives in cardMechanicLine/CardDetailModal. */
export function cardMechanicTag(def: CardDef): string | null {
  if (def.rowScorch) return 'Sor felperzselés';
  if (def.specialText) return 'Egyedi képesség';
  return null;
}

export type CardSortKey = 'name' | 'power' | 'row';

export const CARD_SORT_OPTIONS: { key: CardSortKey; label: string }[] = [
  { key: 'name', label: 'Név' },
  { key: 'power', label: 'Erő' },
  { key: 'row', label: 'Sor' },
];

const ROW_ORDER: Record<Row, number> = { Melee: 0, Ranged: 1, Siege: 2 };

/** Pure display-order sort, deck-builder UI only — never affects deck validity/rules. */
export function sortCards(cards: CardDef[], key: CardSortKey): CardDef[] {
  const sorted = [...cards];
  switch (key) {
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'power':
      return sorted.sort((a, b) => (b.basePower ?? -1) - (a.basePower ?? -1) || a.name.localeCompare(b.name));
    case 'row':
      return sorted.sort(
        (a, b) =>
          (a.row ? ROW_ORDER[a.row] : 3) - (b.row ? ROW_ORDER[b.row] : 3) || a.name.localeCompare(b.name),
      );
  }
}
