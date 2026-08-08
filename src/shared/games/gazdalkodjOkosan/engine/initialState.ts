import { BOARD_SPACES, STARTING_CASH } from './boardConfig';
import { CHANCE_CARDS } from './chanceCards';
import { ALL_FURNITURE_ITEMS } from './furnitureCatalog';
import type { FurnitureItemId, GazdalkodjOkosanState, Player } from './state';

function emptyFurnitureRecord(): Record<FurnitureItemId, boolean> {
  return Object.fromEntries(ALL_FURNITURE_ITEMS.map((item) => [item, false])) as Record<FurnitureItemId, boolean>;
}

export function createInitialState(playerNames: string[]): GazdalkodjOkosanState {
  const players: Player[] = playerNames.map((name, index) => ({
    id: `player-${index + 1}`,
    name,
    cash: STARTING_CASH,
    bankAccount: null,
    hasBkvPass: false,
    position: 0,
    apartment: { kind: 'NONE' },
    car: { kind: 'NONE' },
    furniture: emptyFurnitureRecord(),
    insurance: { life: false, home: false, car: false },
    inHospital: false,
    hospitalRollAttempts: 0,
    skipNextRoll: false,
    extraRollsPending: 0,
    bankrupt: false,
  }));

  return {
    board: BOARD_SPACES.map((space) => ({ ...space })),
    chanceDeck: CHANCE_CARDS.map((card) => ({ ...card })),
    players,
    currentPlayerIndex: 0,
    turnPhase: 'AWAITING_ROLL',
    pendingMandatoryInstallments: [],
    lastDiceRoll: null,
    status: 'IN_PROGRESS',
    winnerId: null,
    log: [],
  };
}
