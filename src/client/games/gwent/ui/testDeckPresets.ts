import { cardsForFaction, type DeckCardCounts } from '../../../../shared/games/gwent/engine/deckRules';
import type { Faction } from '../../../../shared/games/gwent/engine/types';

/**
 * Dev/teszt-kényelmi funkció (2026-08-05, a felhasználó kérésére): egy
 * kattintással kitölt egy garantáltan ÉRVÉNYES paklit egy adott frakcióhoz,
 * hogy ne kelljen minden egyes teszt-parti előtt végigkattintani a
 * pakli-építőt. Minden elérhető lapot (a frakció saját lapjai + a Neutral
 * lapok) a maximális példányszámáig felvesz — ez triviálisan érvényes
 * (messze a `MIN_NON_HERO_UNIT_CARDS` fölött), és a lehető legtöbb
 * mechanikát lefedi egyetlen teszt-partiban (Muster, Spy, Medic, Decoy,
 * Kürt, mind a 4 Időjárás-lap, stb.) — NEM egy "reális", kiegyensúlyozott
 * pakli, csak egy gyors, biztosan induló teszt-készlet.
 */
export function buildTestDeckCounts(faction: Faction): DeckCardCounts {
  const counts: DeckCardCounts = {};
  for (const def of cardsForFaction(faction)) {
    counts[def.id] = def.copies;
  }
  return counts;
}
