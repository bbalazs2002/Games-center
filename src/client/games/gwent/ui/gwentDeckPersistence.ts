import type { DeckCardCounts } from '@shared/games/gwent/engine/deckRules';
import type { Faction } from '@shared/games/gwent/engine/types';

/**
 * Gwent-0a.1 has no match engine yet (see docs/gwent-0a-specifikacio.md §1) — a
 * built deck is simply saved locally for 0a.2 to pick up later. Same idiom as
 * hotelLocalGamePersistence.ts (typed interface, try/catch-wrapped localStorage).
 *
 * Gwent-0c.3 §2: ONE slot PER FACTION, not a single global slot — a real
 * playtest report ("frakciónként mentsen paklit"): the old single-slot
 * version meant saving a Monsters deck silently overwrote a previously saved
 * Scoia'tael one. `v2` because the stored shape changed (a map, not one
 * deck) — a stale `v1` value is simply ignored, never migrated (low-stakes
 * local data, not worth the extra code).
 */
const STORAGE_KEY = 'gwent-deck-v2';

export interface PersistedGwentDeck {
  faction: Faction;
  leaderId: string;
  cardCounts: DeckCardCounts;
  savedAt: string;
}

type PersistedGwentDecks = Partial<Record<Faction, PersistedGwentDeck>>;

function loadAll(): PersistedGwentDecks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedGwentDecks;
  } catch {
    return {};
  }
}

export function loadPersistedGwentDeck(faction: Faction): PersistedGwentDeck | null {
  return loadAll()[faction] ?? null;
}

export function saveGwentDeck(deck: Omit<PersistedGwentDeck, 'savedAt'>): void {
  try {
    const all = loadAll();
    all[deck.faction] = { ...deck, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Not worth surfacing to the player — same reasoning as hotelLocalGamePersistence.ts.
  }
}

export function clearPersistedGwentDecks(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
