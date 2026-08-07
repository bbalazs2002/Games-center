import { assetUrl } from '../../../core/assetUrl';
import { getCardDef } from '@shared/games/gwent/engine/cardDefs';
import { getLeaderDef } from '@shared/games/gwent/engine/leaderDefs';
import { HIDDEN_CARD_DEF_ID } from '@shared/games/gwent/engine/specialCardIds';
import type { CardInstance, GwentState } from '@shared/games/gwent/engine/state';
import { CARD_BACK_PATHS } from './board/cardBackPaths';
import { pickVariant } from './board/cardArtVariant';

function preloadImage(path: string): void {
  const img = new Image();
  img.src = assetUrl(path);
}

/**
 * Gwent-0c.3 §7: warms the browser's image cache for every card the CURRENT
 * match could ever show, so the card-flight animation (cardFlight.tsx) never
 * flashes a blank frame waiting on a first-time network fetch mid-flight.
 *
 * Only ever called with the TRUE, unmasked local state (see GwentGamePage.tsx
 * — `LocalGameTransport` never masks internally, so hot-seat play has no
 * real secret to protect from itself). A player's full deck/hand/discard set
 * is fixed at deal time (cards only move BETWEEN those piles, never appear
 * from nowhere), so preloading once at match start covers the whole match —
 * no need to re-run on every draw/play.
 */
export function preloadGwentMatchImages(state: GwentState): void {
  const paths = new Set<string>();

  function addInstance(instance: CardInstance): void {
    if (instance.defId === HIDDEN_CARD_DEF_ID) return;
    const def = getCardDef(instance.defId);
    paths.add(pickVariant(instance, def.imagePaths));
  }

  for (const player of state.players) {
    for (const instance of [...player.hand, ...player.deck, ...player.discard]) addInstance(instance);
    for (const row of Object.values(player.board)) for (const instance of row.cards) addInstance(instance);
    paths.add(getLeaderDef(player.leaderId).imagePaths[0]);
    paths.add(CARD_BACK_PATHS[player.faction]);
  }

  for (const path of paths) preloadImage(path);
}
