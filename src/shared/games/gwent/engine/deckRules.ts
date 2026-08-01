import { CARD_DEFS, getCardDef } from './cardDefs';
import { getLeaderDef } from './leaderDefs';
import type { CardDef, Faction } from './types';

/**
 * Minimum non-Hero unit-card count for a legal deck — confirmed 2026-07-31 via
 * web research (the physical rulebook doesn't cover deck-building at all, see
 * docs/gwent-0a-specifikacio.md §2's "Pakli-építés szabálya" note). Hero-ability
 * cards do NOT count toward this minimum. There is no documented upper bound.
 */
export const MIN_NON_HERO_UNIT_CARDS = 22;

export function isHeroCard(def: CardDef): boolean {
  return def.abilities.includes('Hero');
}

export function isCardAvailableToFaction(def: CardDef, faction: Faction): boolean {
  return def.faction === 'Neutral' || def.faction === faction;
}

/** cardDefId -> how many copies the draft deck currently includes. */
export type DeckCardCounts = Record<string, number>;

export interface GwentDeckDraft {
  faction: Faction;
  leaderId: string;
  cardCounts: DeckCardCounts;
}

export interface DeckValidationResult {
  valid: boolean;
  nonHeroUnitCount: number;
  totalCardCount: number;
  errors: string[];
}

/**
 * Pure validation, no game/engine state involved — usable from the deck-builder
 * UI (live feedback) and later, unchanged, from the server room when a match
 * actually starts (Gwent-0b), same "reducer doesn't care where an action came
 * from" separation as every other game on this platform.
 */
export function validateDeckDraft(draft: GwentDeckDraft): DeckValidationResult {
  const errors: string[] = [];

  const leader = tryGetLeaderDef(draft.leaderId);
  if (!leader) {
    errors.push('Nincs kiválasztott vezér.');
  } else if (leader.faction !== draft.faction) {
    errors.push('A választott vezér nem a választott frakcióhoz tartozik.');
  }

  let nonHeroUnitCount = 0;
  let totalCardCount = 0;
  for (const [cardId, count] of Object.entries(draft.cardCounts)) {
    if (count <= 0) continue;
    const def = tryGetCardDef(cardId);
    if (!def) {
      errors.push(`Ismeretlen kártya: ${cardId}`);
      continue;
    }
    if (!isCardAvailableToFaction(def, draft.faction)) {
      errors.push(`"${def.name}" nem választható ehhez a frakcióhoz.`);
      continue;
    }
    if (count > def.copies) {
      errors.push(`"${def.name}"-ból legfeljebb ${def.copies} példány szerepelhet a paliban.`);
    }
    totalCardCount += count;
    if (def.kind === 'Unit' && !isHeroCard(def)) nonHeroUnitCount += count;
  }

  if (nonHeroUnitCount < MIN_NON_HERO_UNIT_CARDS) {
    errors.push(`Legalább ${MIN_NON_HERO_UNIT_CARDS} nem-Hero egységkártya szükséges (jelenleg: ${nonHeroUnitCount}).`);
  }

  return { valid: errors.length === 0, nonHeroUnitCount, totalCardCount, errors };
}

export function cardsForFaction(faction: Faction): CardDef[] {
  return CARD_DEFS.filter((def) => isCardAvailableToFaction(def, faction));
}

function tryGetCardDef(id: string): CardDef | null {
  try {
    return getCardDef(id);
  } catch {
    return null;
  }
}

function tryGetLeaderDef(id: string) {
  try {
    return getLeaderDef(id);
  } catch {
    return null;
  }
}
