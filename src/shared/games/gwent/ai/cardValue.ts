import type { CardDef } from '../engine/types';

/**
 * Pure, state-independent estimate of a card's tactical worth — the ONE
 * shared "what's this card worth" notion for the whole AI module, reused by:
 * deckBuilder.ts (ranking which cards to include in a tactically-built deck),
 * strategy.ts (hand-value scoring), and actionEnumerator.ts (ordering a
 * greedy Medic revival chain). See docs/gwent-0e-ai-specifikacio.md §5/§8.2/§8.3.
 *
 * Weights are a reasonable starting point, not playtested — deliberately NOT
 * Claude's job to fine-tune (see the spec's §1 "Nincs hatókörben").
 */
export function estimateCardValue(def: CardDef): number {
  if (def.kind !== 'Unit') {
    // Decoy/Horn/Scorch/Weather have no basePower to rank by — a flat,
    // moderate baseline keeps them competitive against weak units when
    // scoring a hand, without a separate non-unit ranking pass.
    return 4;
  }

  let value = def.basePower ?? 0;

  if (def.abilities.includes('Hero')) value += 1; // immune to Scorch/weather/leader multipliers
  if (def.abilities.includes('Muster')) value += 3; // guaranteed, free extra board presence
  if (def.abilities.includes('TightBond')) value += 2; // scales further with actual copies played together, not modeled here
  if (def.abilities.includes('Medic')) value += 3; // chain-revival potential — see actionEnumerator.ts's greedy chain builder
  if (def.abilities.includes('Spy')) value += 2; // net card-advantage (2 drawn) outweighs the power handed to the opponent
  if (def.abilities.includes('MoraleBoost')) value += 1; // buffs every OTHER card sharing its row

  return value;
}
