import type { CardDef, CardKind, Row, UnitAbility } from '../../../../shared/games/gwent/engine/types';

export const ROW_LABELS_HU: Record<Row, string> = {
  Melee: 'Közelharc',
  Ranged: 'Távolsági',
  Siege: 'Ostrom',
};

/** Gwent-0c.2 §F, 6. pont: CardDetailModal's "Típus" mező magyarul. */
export const CARD_KIND_LABELS_HU: Record<CardKind, string> = {
  Unit: 'Egység',
  Weather: 'Időjárás',
  Decoy: 'Csali',
  Horn: 'Kürt',
  Scorch: 'Felperzselés',
};

/** Gwent-0c.2 §F, 6. pont: CardDetailModal's "Képességek" mező magyarul. */
export const ABILITY_LABELS_HU: Record<UnitAbility, string> = {
  Hero: 'Hős',
  Spy: 'Kém',
  TightBond: 'Szoros kötelék',
  Muster: 'Toborzás',
  MoraleBoost: 'Morál-növelés',
  Medic: 'Gyógyász',
  Agile: 'Fürge',
};

/** A modál MELLETT megjelenő magyarázó sáv szövege — mit is jelent egy adott képesség (Gwent-0c.2 §F, 6. pont). */
export const ABILITY_DESCRIPTIONS_HU: Record<UnitAbility, string> = {
  Hero: 'Hős kártyát semmilyen speciális lap vagy képesség nem érinthet (pl. Sor felperzselés, Csali).',
  Spy: 'Az ellenfél oldalára kerül (az ő össz-erejét növeli), de a kijátszó azonnal húz 2 lapot a saját paklijából.',
  TightBond: 'Ha egy azonos nevű lap mellé kerül ugyanabba a sorba, mindkettő ereje megduplázódik.',
  Muster: 'Kijátszáskor a pakliból/kézből minden azonos nevű (vagy a lap saját "musters with" listáján szereplő) példány azonnal, automatikusan is lejátszásra kerül.',
  MoraleBoost: 'A sorban lévő összes MÁS egység erejét +1-gyel növeli (önmagára nem hat).',
  Medic: 'Kijátszáskor egy lap választható a dobott lapok közül, ami azonnal, ingyen visszakerül a táblára.',
  Agile: 'Kijátszáskor a Közelharc vagy a Távolsági sor közül szabadon választható, melyikbe kerüljön.',
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

/**
 * Human-readable one-liner for a card's unique mechanic (RowScorch or the
 * freeform specialText), if it has one — NOT self-labeled (Gwent-0c.3 §3:
 * moved into CardDetailModal's right-side ability-explanation panel
 * alongside real abilities, which already prints its own bold
 * `cardMechanicTag` heading above this line — a baked-in "Sor felperzselés:"
 * prefix here would just duplicate it).
 */
export function cardMechanicLine(def: CardDef): string | null {
  if (def.rowScorch) {
    return `Elpusztítja az ellenfél ${ROW_LABELS_HU[def.rowScorch.targetRow]} sorának legerősebb kártyáját/kártyáit, ha annak össz-ereje eléri a ${def.rowScorch.threshold}-et.`;
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
