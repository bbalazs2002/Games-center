import { cardsForFaction, isHeroCard, MIN_NON_HERO_UNIT_CARDS, validateDeckDraft, type DeckCardCounts } from '../engine/deckRules';
import type { GwentPlayerConfig } from '../engine/initialState';
import { LEADER_DEFS } from '../engine/leaderDefs';
import type { Faction } from '../engine/types';
import { estimateCardValue } from './cardValue';

const FACTIONS: Faction[] = ['NorthernRealms', 'Nilfgaard', 'Monsters', 'Scoiatael'];

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Deliberate, value-ranked card selection for `faction` — see
 * docs/gwent-0e-ai-specifikacio.md §5 (felhasználói korrekció, 2026-08-07:
 * NOT random). Greedily takes the highest-`estimateCardValue` non-Hero unit
 * cards (up to their legal copy count) until EXACTLY reaching
 * `MIN_NON_HERO_UNIT_CARDS` — a tighter deck built only from the best cards
 * maximizes the odds of redrawing them within a round, a real Gwent
 * strategic principle; there's no reason to pad it with weaker filler. Every
 * available special card (Decoy/Horn/Scorch/Weather) is included too — those
 * never count toward the threshold, and a deliberately-built deck has no
 * reason to omit any of them.
 */
function buildTacticalCardCounts(faction: Faction): DeckCardCounts {
  const pool = cardsForFaction(faction);
  const nonHeroUnits = pool.filter((def) => def.kind === 'Unit' && !isHeroCard(def));
  const specials = pool.filter((def) => def.kind !== 'Unit');
  const rankedUnits = [...nonHeroUnits].sort((a, b) => estimateCardValue(b) - estimateCardValue(a));

  const cardCounts: DeckCardCounts = {};
  let nonHeroUnitCount = 0;
  for (const def of rankedUnits) {
    if (nonHeroUnitCount >= MIN_NON_HERO_UNIT_CARDS) break;
    const take = Math.min(def.copies, MIN_NON_HERO_UNIT_CARDS - nonHeroUnitCount);
    cardCounts[def.id] = take;
    nonHeroUnitCount += take;
  }

  for (const def of specials) cardCounts[def.id] = def.copies;

  return cardCounts;
}

/**
 * Random faction + random faction-legal leader (unchanged from the original
 * plan — see docs/gwent-0e-ai-specifikacio.md §1/§5), but a TACTICALLY built
 * card selection, not a random one. Same function for every difficulty tier
 * — difficulty only affects in-match decisions (strategy.ts), never deck
 * construction.
 */
export function buildTacticalAiDeckConfig(name: string): GwentPlayerConfig {
  const faction = pickRandom(FACTIONS);
  const leaderCandidates = LEADER_DEFS.filter((leader) => leader.faction === faction);
  const leaderId = pickRandom(leaderCandidates).id;
  const cardCounts = buildTacticalCardCounts(faction);

  const validation = validateDeckDraft({ faction, leaderId, cardCounts });
  if (!validation.valid) {
    // Should be unreachable — the generator only ever adds legal-count,
    // faction-legal cards — but fail loudly rather than silently handing a
    // caller (GwentRoom/the hot-seat setup screen) an invalid deck if the
    // card catalog or thresholds ever change underneath this.
    throw new Error(`buildTacticalAiDeckConfig produced an invalid deck: ${validation.errors.join('; ')}`);
  }

  return { name, faction, leaderId, cardCounts };
}
