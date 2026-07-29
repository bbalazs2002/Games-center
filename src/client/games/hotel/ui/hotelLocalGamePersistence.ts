import type { HotelState } from '../../../../shared/games/hotel/engine/state';
import type { HotSeatAiSlots } from './useHotSeatAi';

/**
 * Resuming a local (formerly "hot-seat") game across a page reload — a real
 * playtest request (2026-07-27): "Az oldal újratöltésekor nem lépett vissza
 * a megkezdett játékba." Online mode needs none of this (the server already
 * IS the persistent state); this only ever runs for HotelGamePage's own
 * LocalGameTransport branch.
 */
const STORAGE_KEY = 'hotel-local-game-v1';

export interface PersistedHotelLocalGame {
  state: HotelState;
  hotSeatAiSlots: HotSeatAiSlots;
}

/** `localStorage` can throw (private browsing, quota, disabled) — persistence is a nice-to-have, never worth crashing the game over. */
export function loadPersistedHotelLocalGame(): PersistedHotelLocalGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedHotelLocalGame;
  } catch {
    return null;
  }
}

export function saveHotelLocalGame(data: PersistedHotelLocalGame): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Resuming next time just won't work — not worth surfacing to the player.
  }
}

export function clearPersistedHotelLocalGame(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
