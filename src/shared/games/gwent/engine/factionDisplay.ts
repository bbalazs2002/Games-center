import type { Faction } from './types';

// Hivatalos szabály (docs/gwent-0a-specifikacio.md §2) — a frakció-bónusz szövege
// csak megjelenítés, a tényleges kikényszerítés Gwent-0a.2 (a parti-motor) feladata.
export interface FactionOption {
  id: Faction;
  label: string;
  bonus: string;
}

export const FACTION_OPTIONS: FactionOption[] = [
  { id: 'NorthernRealms', label: 'Northern Realms', bonus: 'Minden megnyert kör után +1 lapot húz a saját paklijából.' },
  { id: 'Nilfgaard', label: 'Nilfgaardian Empire', bonus: 'Egy döntetlenre végződő kört automatikusan megnyer.' },
  { id: 'Monsters', label: 'Monsters', bonus: 'Minden kör után 1 véletlenszerű egységkártyája a táblán marad.' },
  { id: 'Scoiatael', label: "Scoia'tael", bonus: 'Az 1. kör elején ez a játékos dönti el, ki kezd.' },
];

export function factionLabel(faction: Faction): string {
  return FACTION_OPTIONS.find((f) => f.id === faction)?.label ?? faction;
}
