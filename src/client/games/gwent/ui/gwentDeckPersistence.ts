import type { DeckCardCounts } from '../../../../shared/games/gwent/engine/deckRules';
import type { Faction } from '../../../../shared/games/gwent/engine/types';

/**
 * Gwent-0a.1 has no match engine yet (see docs/gwent-0a-specifikacio.md §1) — a
 * built deck is simply saved locally for 0a.2 to pick up later. Same idiom as
 * hotelLocalGamePersistence.ts (typed interface, try/catch-wrapped localStorage).
 */
const STORAGE_KEY = 'gwent-deck-v1';

export interface PersistedGwentDeck {
  faction: Faction;
  leaderId: string;
  cardCounts: DeckCardCounts;
  savedAt: string;
}

export function loadPersistedGwentDeck(): PersistedGwentDeck | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedGwentDeck;
  } catch {
    return null;
  }
}

export function saveGwentDeck(deck: Omit<PersistedGwentDeck, 'savedAt'>): void {
  try {
    const data: PersistedGwentDeck = { ...deck, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Not worth surfacing to the player — same reasoning as hotelLocalGamePersistence.ts.
  }
}

export function clearPersistedGwentDeck(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
