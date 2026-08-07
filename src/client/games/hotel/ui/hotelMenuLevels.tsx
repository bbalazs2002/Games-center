import { Banknote, Dice5, Flag, Gavel, Hammer, Milestone, Moon, ShoppingCart, Trees } from 'lucide-react';
import type { HotelAction } from '@shared/games/hotel/engine/actions';
import {
  computeAuctionOpeningBid,
  computeLotPurchasePrice,
  getConstructionEligibleLots,
  getCurrentPlayer,
  getNextConstructionStep,
} from '@shared/games/hotel/engine/rules';
import { getValidActions } from '@shared/games/hotel/engine/selectors';
import type { ConstructionPlanItem, HotelLot, HotelState } from '@shared/games/hotel/engine/state';
import type { WheelMenuSlice } from '../../../ui-kit/WheelMenu';

export type Dispatch = (action: HotelAction) => void;

export type MenuLevel =
  | { kind: 'root' }
  | { kind: 'purchase-lots' }
  | { kind: 'construction-lots' }
  | { kind: 'staircase-right-lots' }
  /** Picking which owned lot to put up for auction — either voluntarily (anytime on your own turn) or to raise cash toward a pending debt (2026-08-04 redesign, see docs/hotel-0a-specifikacio.md §9). The actual bidding, once started, is NOT a wheel level — see PlayerActionWheel's AuctionBidPanel. */
  | { kind: 'auction-lots' };

/**
 * Which staircase-space picker is currently armed, if any — `spaceId` is
 * chosen by clicking one of the translucent staircase previews rendered
 * directly on the 3D board (`HotelGamePage.tsx`'s `StaircaseCandidateOverlay`)
 * rather than through a wheel submenu, per the user's request that the
 * LOCATION choice happen on the board, not in a list. `'paid'` still needs
 * `lotId` (chosen via `staircase-right-lots` first, since price differs per
 * lot); `'free'` doesn't, since `getFreeStaircaseCandidates` already spans
 * every owned lot at once.
 */
export type StaircasePlacementMode = { kind: 'paid'; lotId: string } | { kind: 'free' };

export interface NavigationHelpers {
  push: (level: MenuLevel) => void;
}

function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

const PERMIT_DIE_FACES = ['GREEN', 'GREEN', 'GREEN', 'FREE', 'DOUBLE', 'RED'] as const;
/** Also used directly by PlayerActionWheel — requesting the permit rolls it immediately, see §9.2. */
export function rollPermitDie() {
  return PERMIT_DIE_FACES[Math.floor(Math.random() * PERMIT_DIE_FACES.length)];
}

/**
 * Always-present top-level slices — unavailable ones stay visible but
 * disabled (docs/hotel-0a-specifikacio.md §9.2, per the requested
 * assets/Hotel/UI-menu.png look), rather than appearing/disappearing. Every
 * enabled/disabled decision comes straight from `getValidActions(state)` —
 * the same legality the reducer itself enforces — so this menu can never
 * offer something the reducer would then reject (docs §9.2, "GetValidAction"
 * request).
 */
export function rootSlices(
  state: HotelState,
  dispatch: Dispatch,
  nav: NavigationHelpers,
  onRequestForfeit: () => void,
  onStartStaircasePlacement: (mode: StaircasePlacementMode) => void,
): WheelMenuSlice[] {
  const valid = getValidActions(state);
  return [
    {
      id: 'roll-move',
      label: 'Dobás',
      icon: <Dice5 />,
      disabled: !valid.canRollMoveDice,
      onSelect: () => dispatch({ type: 'ROLL_MOVE_DICE', value: rollD6() }),
    },
    {
      id: 'buy',
      label: 'Vásárlás',
      icon: <ShoppingCart />,
      disabled: valid.buyableLots.length === 0,
      // Always drill into the submenu, even with a single buyable lot — the
      // level must stay visible so the player sees what they're about to buy.
      onSelect: () => nav.push({ kind: 'purchase-lots' }),
    },
    {
      id: 'construction',
      label: 'Építkezés',
      icon: <Hammer />,
      disabled: !valid.canStartConstruction,
      onSelect: () => nav.push({ kind: 'construction-lots' }),
    },
    {
      id: 'roll-nights',
      label: 'Hány éjszaka?',
      icon: <Moon />,
      disabled: !valid.canRollNights,
      onSelect: () => dispatch({ type: 'ROLL_NIGHTS', value: rollD6() }),
    },
    {
      id: 'staircase-right',
      label: 'Lépcső vásárlása',
      icon: <Milestone />,
      disabled: !valid.canBuyStaircaseRight || valid.staircaseEligibleLots.length === 0,
      onSelect: () => nav.push({ kind: 'staircase-right-lots' }),
    },
    {
      id: 'free-staircase-choice',
      label: 'Lépcső elhelyezése',
      icon: <Milestone />,
      disabled: !valid.canChooseFreeStaircaseSpace,
      onSelect: () => onStartStaircasePlacement({ kind: 'free' }),
    },
    {
      id: 'auction',
      label: 'Árverés',
      icon: <Gavel />,
      // Once AUCTION_IN_PROGRESS starts, this whole wheel is replaced by
      // PlayerActionWheel's AuctionBidPanel (bidding needs a free-typed
      // amount, not a wheel slice) — this slice only ever needs to handle
      // STARTING a new auction, either voluntarily (any owned lot, any time
      // on your own turn) or to raise cash toward a pending debt.
      disabled: !valid.canStartAuction,
      onSelect: () => nav.push({ kind: 'auction-lots' }),
    },
    {
      id: 'forfeit',
      label: 'Feladás',
      icon: <Flag />,
      disabled: !valid.canForfeit,
      // Confirmed via a modal (docs/hotel-0a-specifikacio.md §9.2) — too
      // consequential (bankrupt + every lot lost) to fire on a single tap.
      onSelect: onRequestForfeit,
    },
    {
      id: 'end-turn',
      label: 'Kör vége',
      icon: <Banknote />,
      disabled: !valid.canEndTurn,
      onSelect: () => dispatch({ type: 'END_TURN' }),
    },
  ];
}

/**
 * Picking a lot only ARMS the purchase — the actual `BUY_LOT` dispatch
 * happens from `PurchaseConfirmModal`'s own confirm button once the player
 * has seen the lot's full data (name, telek/lépcső/építkezés/éjszaka árak) —
 * a real playtest request (2026-07-27): buying used to fire immediately on
 * this one tap, with no chance to review what it'd cost.
 */
export function purchaseLotSlices(state: HotelState, onSelectLot: (lotId: string) => void): WheelMenuSlice[] {
  return getValidActions(state).buyableLots.map((lot) => ({
    id: `buy-${lot.id}`,
    label: `${lot.name} (${computeLotPurchasePrice(lot)})`,
    icon: <ShoppingCart />,
    onSelect: () => onSelectLot(lot.id),
  }));
}

/**
 * One slice per owned lot, offering whatever's next in the fixed build order
 * (buildings first, garden only once every building is up — enforced by the
 * shared `getNextConstructionStep`, not re-derived here). Each click adds
 * one increment to the transient `pending` selection; doesn't navigate
 * anywhere, so the player can keep picking across lots.
 */
export function constructionLotSlices(
  state: HotelState,
  pending: ConstructionPlanItem[],
  addToPending: (item: ConstructionPlanItem) => void,
): WheelMenuSlice[] {
  const player = getCurrentPlayer(state);
  return getConstructionEligibleLots(state, player.id).map((lot) => nextConstructionSlice(lot, pending, addToPending));
}

function nextConstructionSlice(
  lot: HotelLot,
  pending: ConstructionPlanItem[],
  addToPending: (item: ConstructionPlanItem) => void,
): WheelMenuSlice {
  const existing = pending.find((item) => item.lotId === lot.id);
  const pendingBuildingCount = existing?.buildingCount ?? 0;
  const pendingGarden = existing?.buildGarden ?? false;
  const nextStep = getNextConstructionStep(lot, pendingBuildingCount, pendingGarden);
  if (!nextStep) {
    return { id: `lot-${lot.id}`, label: `${lot.name}: minden megvan`, icon: <Hammer />, disabled: true };
  }

  const addsBuilding = nextStep.buildingCount > pendingBuildingCount;
  const price = addsBuilding ? lot.buildingPrices[lot.buildingsBuilt + pendingBuildingCount] : lot.gardenPrice;
  const label = addsBuilding
    ? `${lot.name}: ${lot.buildingsBuilt + pendingBuildingCount + 1}. épület (${price})`
    : `${lot.name}: Kert (${price})`;

  return { id: `lot-${lot.id}`, label, icon: addsBuilding ? <Hammer /> : <Trees />, onSelect: () => addToPending(nextStep) };
}

/** Picking a lot only narrows things down (price differs per lot) — the actual space is chosen by clicking one of the translucent previews rendered on the 3D board, per `onStartStaircasePlacement`. */
export function staircaseRightLotSlices(
  state: HotelState,
  onStartStaircasePlacement: (mode: StaircasePlacementMode) => void,
): WheelMenuSlice[] {
  return getValidActions(state).staircaseEligibleLots.map((lot) => ({
    id: `staircase-${lot.id}`,
    label: `${lot.name} (${lot.staircasePrice})`,
    icon: <Milestone />,
    onSelect: () => onStartStaircasePlacement({ kind: 'paid', lotId: lot.id }),
  }));
}

/** Picking which owned lot to put up for auction — voluntary or debt-forced, see MenuLevel's 'auction-lots' doc comment. */
export function auctionLotSlices(state: HotelState, dispatch: Dispatch): WheelMenuSlice[] {
  return getValidActions(state).auctionableLots.map((lot) => ({
    id: `auction-${lot.id}`,
    label: `${lot.name} (nyitó: ${computeAuctionOpeningBid(lot)})`,
    icon: <Gavel />,
    onSelect: () => dispatch({ type: 'START_AUCTION', lotId: lot.id }),
  }));
}
