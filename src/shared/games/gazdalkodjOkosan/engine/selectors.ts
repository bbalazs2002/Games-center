import {
  canBuyApartment,
  canAffordApartment,
  canBuyBkvPass,
  canBuyCar,
  canAffordCar,
  canBuyFurniture,
  canBuyInsurance,
  canDepositToAccount,
  canDrawChanceCard,
  canEndTurn,
  canOpenBankAccount,
  canPayInstallment,
  canRollMoveDice,
  canWithdrawFromAccount,
  getCurrentPlayer,
  getCurrentSpace,
} from './rules';
import type { FurnitureItemId, GazdalkodjOkosanState, Player, PlayerId } from './state';

export function getWinner(state: GazdalkodjOkosanState): Player | null {
  if (state.status !== 'FINISHED' || !state.winnerId) return null;
  return state.players.find((p) => p.id === state.winnerId) ?? null;
}

export function getPlayerById(state: GazdalkodjOkosanState, playerId: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

/**
 * Minden, amit a soron lévő játékos most jogosan megtehet — a UI (és egy
 * jövőbeli AI) ezt olvassa ahelyett, hogy a turnPhase/eligibility
 * ellenőrzéseket saját maga derivalná újra. Minden mező ugyanazokra a
 * rules.ts predikátumokra épül, amiket a reducer is validál — ez sosem
 * ajánlhat olyan opciót, amit a reducer aztán elutasítana.
 */
export interface GazdalkodjOkosanValidActions {
  canRollMoveDice: boolean;
  canPayApartmentInstallment: boolean;
  canPayCarInstallment: boolean;
  canBuyApartment: { cash: boolean; financed: boolean };
  canBuyCar: { cash: boolean; financed: boolean };
  buyableFurniture: FurnitureItemId[];
  canOpenBankAccount: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  buyableInsurancePolicies: ('life' | 'home' | 'car')[];
  canBuyBkvPass: boolean;
  canDrawChanceCard: boolean;
  canEndTurn: boolean;
}

export function getValidActions(state: GazdalkodjOkosanState): GazdalkodjOkosanValidActions {
  const player = getCurrentPlayer(state);
  const space = getCurrentSpace(state);

  return {
    canRollMoveDice: canRollMoveDice(state),
    canPayApartmentInstallment: canPayInstallment(state, 'apartment'),
    canPayCarInstallment: canPayInstallment(state, 'car'),
    canBuyApartment: {
      cash: canBuyApartment(state) && canAffordApartment(player, false),
      financed: canBuyApartment(state) && canAffordApartment(player, true),
    },
    canBuyCar: {
      cash: canBuyCar(state) && canAffordCar(player, false),
      financed: canBuyCar(state) && canAffordCar(player, true),
    },
    buyableFurniture: (space.furnitureItems ?? []).filter((item) => canBuyFurniture(state, item)),
    canOpenBankAccount: canOpenBankAccount(state),
    canDeposit: canDepositToAccount(state, 1),
    canWithdraw: canWithdrawFromAccount(state, 1),
    buyableInsurancePolicies: (['life', 'home', 'car'] as const).filter((policy) => canBuyInsurance(state, policy)),
    canBuyBkvPass: canBuyBkvPass(state),
    canDrawChanceCard: canDrawChanceCard(state),
    canEndTurn: canEndTurn(state),
  };
}
