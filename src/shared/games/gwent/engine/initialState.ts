import { shuffle } from '../../../core/shuffle';
import { getCardDef } from './cardDefs';
import type { DeckCardCounts } from './deckRules';
import type { Faction } from './types';
import { createEmptyBoard, type CardInstance, type GwentState, type PlayerId, type PlayerState } from './state';
import { FOLTEST_KING_OF_TEMERIA, FRANCESCA_DAISY_OF_THE_VALLEY } from './leaderConstants';
import { isLeaderAbilityCanceled } from './leaderPassives';
import { appendLog } from './rules';

const STARTING_HAND_SIZE = 10;
/** Exported — the UI (LifeTokens, Gwent-0c) needs this to know how many life-token slots to render. */
export const STARTING_LIVES = 2;
const STARTING_MULLIGANS = 2;

export interface GwentPlayerConfig {
  name: string;
  faction: Faction;
  leaderId: string;
  cardCounts: DeckCardCounts;
}

function buildDeck(playerId: PlayerId, cardCounts: DeckCardCounts): CardInstance[] {
  const pool: CardInstance[] = [];
  for (const [defId, count] of Object.entries(cardCounts)) {
    for (let i = 0; i < count; i += 1) {
      pool.push({ instanceId: `${playerId}-${defId}-${i}`, defId, chosenRow: null });
    }
  }
  return shuffle(pool);
}

function buildPlayer(playerId: PlayerId, config: GwentPlayerConfig, opponentLeaderId: string): PlayerState {
  const deck = buildDeck(playerId, config.cardCounts);
  // Francesca Findabair: Daisy of the Valley — draws 1 extra starting card (category C
  // leader ability, resolved once here since it's automatic at match start, no player
  // action — see leaderConstants.ts / docs/gwent-0a-specifikacio.md §"Gwent-0a.2").
  // Canceled the same as any other category, if the OPPONENT has Emhyr The White Flame
  // (real playtest correction, 2026-08-08 — see leaderPassives.ts's isLeaderAbilityCanceled).
  const daisyBonusApplies = config.leaderId === FRANCESCA_DAISY_OF_THE_VALLEY && !isLeaderAbilityCanceled(config.leaderId, opponentLeaderId);
  const handSize = daisyBonusApplies ? STARTING_HAND_SIZE + 1 : STARTING_HAND_SIZE;
  const hand = deck.slice(0, handSize);
  const remainingDeck = deck.slice(handSize);

  return {
    id: playerId,
    name: config.name,
    faction: config.faction,
    leaderId: config.leaderId,
    // Daisy of the Valley's ability already resolved above (the extra card,
    // if it wasn't canceled) — mark it used immediately so LeaderAbilityPanel
    // shows "elhasználva" instead of a permanently-disabled "Aktiválás"
    // button for the rest of the match (she has no LEADER_ABILITIES entry —
    // category C, see leaderConstants.ts — so canActivateLeaderAbility would
    // never let it be pressed anyway; this just makes the UI say so). Stays
    // false when canceled — she never actually got to use it.
    leaderAbilityUsed: daisyBonusApplies,
    deck: remainingDeck,
    hand,
    discard: [],
    board: createEmptyBoard(),
    lives: STARTING_LIVES,
    roundsWon: 0,
    passed: false,
    mulligansLeft: STARTING_MULLIGANS,
    mulliganSetAside: [],
    mulliganConfirmed: false,
  };
}

/** `getCardDef` is called defensively for every entry up front so a bad persisted deck (stale defId from a data-pipeline change) fails loudly here rather than crashing deep inside a later power calculation. */
function validateCardCounts(cardCounts: DeckCardCounts): void {
  for (const defId of Object.keys(cardCounts)) getCardDef(defId);
}

export function createInitialState(playerConfigs: [GwentPlayerConfig, GwentPlayerConfig]): GwentState {
  for (const config of playerConfigs) validateCardCounts(config.cardCounts);
  const players: [PlayerState, PlayerState] = [
    buildPlayer('player-1', playerConfigs[0], playerConfigs[1].leaderId),
    buildPlayer('player-2', playerConfigs[1], playerConfigs[0].leaderId),
  ];
  let state: GwentState = {
    players,
    currentPlayerIndex: 0,
    round: 1,
    activeWeatherRows: [],
    phase: 'MULLIGAN',
    winnerIds: [],
    log: [],
  };
  // Surface Emhyr The White Flame's always-on cancellation in the log right
  // from the start — otherwise a player would have no visible explanation
  // for why their leader ability never seems to do anything (real playtest
  // report, 2026-08-08).
  for (const player of players) {
    const opponent = players.find((p) => p.id !== player.id)!;
    if (isLeaderAbilityCanceled(player.leaderId, opponent.leaderId)) {
      state = appendLog(state, { type: 'LEADER_ABILITY_CANCELED', playerId: opponent.id, canceledPlayerId: player.id });
    }
  }
  return state;
}

/**
 * A syntactically valid but unplayable (both empty decks/hands) GwentState —
 * used wherever a caller needs SOME state before the real one is known yet:
 * GwentRoom (before both online players submit their real deck), and
 * GwentGamePage/GwentOnlineGamePage's throwaway placeholder transports. Not
 * meant to ever be shown to a player — see
 * docs/gwent-0b-multiplayer-specifikacio.md §4.5.
 */
export function createPlaceholderGwentState(): GwentState {
  const config: GwentPlayerConfig = { name: '', faction: 'NorthernRealms', leaderId: FOLTEST_KING_OF_TEMERIA, cardCounts: {} };
  return createInitialState([config, config]);
}
