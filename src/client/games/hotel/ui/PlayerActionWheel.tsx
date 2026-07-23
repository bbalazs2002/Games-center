import { useEffect, useState } from 'react';
import type { HotelAction } from '../../../../shared/games/hotel/engine/actions';
import { computeConstructionCost, getCurrentPlayer, getLot } from '../../../../shared/games/hotel/engine/rules';
import type { ConstructionPlanItem, HotelState } from '../../../../shared/games/hotel/engine/state';
import { Button } from '../../../ui-kit/Button';
import { Modal } from '../../../ui-kit/Modal';
import { WheelMenu, type WheelMenuSlice } from '../../../ui-kit/WheelMenu';
import {
  auctionBiddingSlices,
  constructionLotSlices,
  debtAuctionLotSlices,
  freeStaircaseSpaceSlices,
  purchaseLotSlices,
  rollPermitDie,
  rootSlices,
  staircaseRightLotSlices,
  staircaseRightSpaceSlices,
  type MenuLevel,
  type NavigationHelpers,
} from './hotelMenuLevels';
import styles from './PlayerActionWheel.module.css';

export interface PlayerActionWheelProps {
  state: HotelState;
  dispatch: (action: HotelAction) => void;
  /**
   * False when it's not the local player's turn — online mode only (see
   * docs/hotel-0b-multiplayer-specifikacio.md §5, "nyílt információ, tárcsa
   * csak saját körben aktív"). The wheel stays visible either way (everyone
   * always sees the same board/options, matching the physical game), just
   * every slice renders disabled — the server already rejects an
   * out-of-turn action regardless, this is purely a UI affordance. Always
   * true in hot-seat mode (omitted prop), where it's always "your turn" —
   * whoever's turn it is holds the device.
   */
  interactive?: boolean;
}

function computeSlices(
  level: MenuLevel,
  state: HotelState,
  dispatch: (action: HotelAction) => void,
  nav: NavigationHelpers,
  pending: ConstructionPlanItem[],
  addToPending: (item: ConstructionPlanItem) => void,
  onRequestForfeit: () => void,
): WheelMenuSlice[] {
  switch (level.kind) {
    case 'root':
      return rootSlices(state, dispatch, nav, onRequestForfeit);
    case 'purchase-lots':
      return purchaseLotSlices(state, dispatch);
    case 'construction-lots':
      return constructionLotSlices(state, pending, addToPending);
    case 'staircase-right-lots':
      return staircaseRightLotSlices(state, nav);
    case 'staircase-right-spaces':
      return staircaseRightSpaceSlices(state, level.lotId, dispatch);
    case 'free-staircase-spaces':
      return freeStaircaseSpaceSlices(state, dispatch);
    case 'debt-auction-lots':
      return debtAuctionLotSlices(state, dispatch);
    case 'auction-bidding':
      return auctionBiddingSlices(state, dispatch);
    default:
      return [];
  }
}

function describeSelection(item: ConstructionPlanItem): string {
  const parts: string[] = [];
  if (item.buildingCount > 0) parts.push(`+${item.buildingCount} épület`);
  if (item.buildGarden) parts.push('kert');
  return parts.join(', ');
}

/**
 * Floating, collapsible radial action menu for the active player — see
 * docs/hotel-0a-specifikacio.md §5/§9 and assets/Hotel/UI-menu.png for the
 * requested look. Owns its own navigation stack (for the Építkezés -> telek
 * drill-down) and the in-progress, not-yet-sent multi-building construction
 * selection — both are transient UI state, not game state, so they live
 * here rather than in HotelState.
 */
export function PlayerActionWheel({ state, dispatch, interactive = true }: PlayerActionWheelProps) {
  const [open, setOpen] = useState(true);
  const [stack, setStack] = useState<MenuLevel[]>([{ kind: 'root' }]);
  const [pending, setPending] = useState<ConstructionPlanItem[]>([]);
  const [forfeitConfirmOpen, setForfeitConfirmOpen] = useState(false);

  const currentPlayer = getCurrentPlayer(state);

  // A fresh landing or a new player's turn always starts back at the wheel's root.
  useEffect(() => {
    setStack([{ kind: 'root' }]);
    setPending([]);
    setForfeitConfirmOpen(false);
  }, [state.currentPlayerIndex, currentPlayer.position]);

  function push(level: MenuLevel): void {
    setStack((prev) => [...prev, level]);
  }

  function back(): void {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }

  // Every slice that actually fires a game action (as opposed to drilling
  // into a submenu) returns to the wheel's root afterward — mirrors what
  // confirmConstruction/cancelConstruction already did, and keeps a submenu
  // from being left showing a now-stale (or, for a resolved auction, empty)
  // list of options.
  function dispatchAndReturnToRoot(action: HotelAction): void {
    dispatch(action);
    setStack([{ kind: 'root' }]);
  }

  function addToPending(item: ConstructionPlanItem): void {
    setPending((prev) => [...prev.filter((p) => p.lotId !== item.lotId), item]);
  }

  function removeFromPending(lotId: string): void {
    setPending((prev) => prev.filter((p) => p.lotId !== lotId));
  }

  // Requesting the permit rolls it in the same click — there's no separate
  // "Építési engedély" step to visit afterward (docs/hotel-0a-specifikacio.md §9.2).
  function confirmConstruction(): void {
    if (pending.length === 0) return;
    dispatch({ type: 'START_CONSTRUCTION', plan: pending });
    dispatch({ type: 'ROLL_BUILDING_PERMIT', value: rollPermitDie() });
    setPending([]);
    setStack([{ kind: 'root' }]);
  }

  function cancelConstruction(): void {
    setPending([]);
    setStack([{ kind: 'root' }]);
  }

  function confirmForfeit(): void {
    setForfeitConfirmOpen(false);
    dispatchAndReturnToRoot({ type: 'FORFEIT' });
  }

  if (!open) {
    return (
      <button className={styles.collapsedButton} onClick={() => setOpen(true)}>
        {currentPlayer.name}
      </button>
    );
  }

  const level = stack[stack.length - 1];
  const rawSlices = computeSlices(level, state, dispatchAndReturnToRoot, { push }, pending, addToPending, () =>
    setForfeitConfirmOpen(true),
  );
  // Not our turn online — still show every slice (open information), just
  // force them all disabled rather than re-deriving each one's own condition.
  const slices = interactive ? rawSlices : rawSlices.map((slice) => ({ ...slice, disabled: true }));
  // Shown so the player can weigh the risk before requesting the permit — a
  // DOUBLE permit-die roll charges this amount twice (a RED roll charges nothing).
  const totalCost = pending.reduce((sum, item) => sum + computeConstructionCost(getLot(state, item.lotId), item), 0);

  return (
    <div className={[styles.container, !interactive && styles.readOnly].filter(Boolean).join(' ')}>
      <div className={styles.playerLabel}>{currentPlayer.name}</div>
      <WheelMenu slices={slices} onBack={stack.length > 1 ? back : undefined} onClose={() => setOpen(false)} />
      {pending.length > 0 && (
        <div className={styles.selectionPanel}>
          <h3>Kiválasztott építkezések</h3>
          <ul>
            {pending.map((item) => (
              <li key={item.lotId}>
                <span>
                  {getLot(state, item.lotId).name}: {describeSelection(item)}
                </span>
                <button onClick={() => removeFromPending(item.lotId)} aria-label="Törlés">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className={styles.selectionCost}>
            Össz. költség: {totalCost} (dupla dobásnál: {totalCost * 2})
          </p>
          <div className={styles.selectionActions}>
            <Button variant="secondary" onClick={cancelConstruction}>
              Mégse
            </Button>
            <Button onClick={confirmConstruction}>Építési engedélyt kér</Button>
          </div>
        </div>
      )}
      <Modal open={forfeitConfirmOpen} onClose={() => setForfeitConfirmOpen(false)}>
        <h2>Feladod a játékot?</h2>
        <p>Minden telked a bankhoz kerül, és kiesel a játékból. Ez nem vonható vissza.</p>
        <div className={styles.selectionActions}>
          <Button variant="secondary" onClick={() => setForfeitConfirmOpen(false)}>
            Mégse
          </Button>
          <Button onClick={confirmForfeit}>Igen, feladom</Button>
        </div>
      </Modal>
    </div>
  );
}
