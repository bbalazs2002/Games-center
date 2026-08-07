import { useEffect, useState } from 'react';
import type { HotelAction } from '@shared/games/hotel/engine/actions';
import {
  canBuildWithoutPermit,
  canPassBid,
  canPlaceBid,
  computeConstructionCost,
  computeLotPurchasePrice,
  computeNightlyRent,
  getCurrentPlayer,
  getLot,
} from '@shared/games/hotel/engine/rules';
import type { ConstructionPlanItem, HotelLot, HotelState } from '@shared/games/hotel/engine/state';
import { Button } from '../../../ui-kit/Button';
import { Modal } from '../../../ui-kit/Modal';
import { WheelMenu, type WheelMenuSlice } from '../../../ui-kit/WheelMenu';
import { DiceHUD } from './DiceHUD';
import { HotelLotFacts } from './HotelLotFacts';
import modalTheme from './hotelModalTheme.module.css';
import {
  auctionLotSlices,
  constructionLotSlices,
  purchaseLotSlices,
  rollPermitDie,
  rootSlices,
  staircaseRightLotSlices,
  type MenuLevel,
  type NavigationHelpers,
  type StaircasePlacementMode,
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
  /**
   * Which staircase-space picker is currently armed (see `StaircasePlacementMode`)
   * — `null` when no staircase placement is in progress. Owned by
   * `HotelGamePage` (not this component), since the actual space choice
   * happens by clicking a translucent preview on the 3D board, which this
   * component has no access to.
   */
  staircasePlacement: StaircasePlacementMode | null;
  onStartStaircasePlacement: (mode: StaircasePlacementMode) => void;
  onCancelStaircasePlacement: () => void;
}

function computeSlices(
  level: MenuLevel,
  state: HotelState,
  dispatch: (action: HotelAction) => void,
  nav: NavigationHelpers,
  pending: ConstructionPlanItem[],
  addToPending: (item: ConstructionPlanItem) => void,
  onRequestForfeit: () => void,
  onStartStaircasePlacement: (mode: StaircasePlacementMode) => void,
  onSelectLotToBuy: (lotId: string) => void,
): WheelMenuSlice[] {
  switch (level.kind) {
    case 'root':
      return rootSlices(state, dispatch, nav, onRequestForfeit, onStartStaircasePlacement);
    case 'purchase-lots':
      return purchaseLotSlices(state, onSelectLotToBuy);
    case 'construction-lots':
      return constructionLotSlices(state, pending, addToPending);
    case 'staircase-right-lots':
      return staircaseRightLotSlices(state, onStartStaircasePlacement);
    case 'auction-lots':
      return auctionLotSlices(state, dispatch);
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
 * Full data for a lot the player is about to buy (name, telek/lépcső ára,
 * minden építkezési ár, éjszaka-árak táblázatban) — a real playtest request
 * (2026-07-27): buying used to fire immediately on picking a lot from the
 * wheel, with no chance to review what it, its staircase, or its buildings
 * would cost. Shows both the real property-card photos AND the same numbers
 * as plain, readable text/tables — the photos alone weren't considered
 * readable enough on their own.
 */
function PurchaseConfirmModal({
  state,
  lotId,
  onConfirm,
  onCancel,
}: {
  state: HotelState;
  lotId: string | null;
  onConfirm: (lotId: string) => void;
  onCancel: () => void;
}) {
  const lot = lotId ? getLot(state, lotId) : undefined;

  return (
    <Modal open={lot !== undefined} onClose={onCancel} className={modalTheme.hotelModal}>
      {lot && (
        <div className={styles.purchaseConfirm}>
          <h2>{lot.name}</h2>
          <HotelLotFacts lot={lot} />
          <div className={styles.selectionActions}>
            <Button variant="secondary" onClick={onCancel}>
              Mégse
            </Button>
            <Button onClick={() => onConfirm(lot.id)}>Megvásárlom ({computeLotPurchasePrice(lot)})</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Not our turn online, OR a staircase placement is armed (the real choice now happens by clicking a preview on the board, not here) — still show every slice (open information), just force them all disabled rather than re-deriving each one's own condition. */
function resolveSlices(
  rawSlices: WheelMenuSlice[],
  interactive: boolean,
  staircasePlacement: StaircasePlacementMode | null,
): WheelMenuSlice[] {
  if (interactive && !staircasePlacement) return rawSlices;
  return rawSlices.map((slice) => ({ ...slice, disabled: true }));
}

/** Replaces the wheel itself while a staircase placement is armed — the actual space choice happens by clicking a translucent preview on the 3D board (`HotelGamePage.tsx`'s `StaircaseCandidateOverlay`), not through a menu. */
/**
 * Swaps the wheel out for whichever OTHER interaction currently takes
 * precedence — a staircase-space picker armed on the board, or (2026-08-04)
 * an in-progress auction's free-typed bid panel — falling back to the normal
 * wheel otherwise. The two never legitimately overlap (arming a staircase
 * placement doesn't survive into a different turnPhase), but staircase
 * placement wins if they somehow did, since it's the more actively-armed
 * one-shot interaction.
 */
function WheelOrOverlay({
  staircasePlacement,
  onCancelStaircasePlacement,
  state,
  dispatch,
  interactive,
  slices,
  onBack,
  onClose,
}: {
  staircasePlacement: StaircasePlacementMode | null;
  onCancelStaircasePlacement: () => void;
  state: HotelState;
  dispatch: (action: HotelAction) => void;
  interactive: boolean;
  slices: WheelMenuSlice[];
  onBack?: () => void;
  onClose: () => void;
}) {
  if (staircasePlacement) {
    return (
      <div className={styles.staircaseHint}>
        <p>Válassz egy mezőt a táblán a lépcsőnek</p>
        <Button variant="secondary" onClick={onCancelStaircasePlacement}>
          Mégse
        </Button>
      </div>
    );
  }
  if (state.turnPhase === 'AUCTION_IN_PROGRESS') {
    return <AuctionBidPanel state={state} dispatch={dispatch} interactive={interactive} />;
  }
  return <WheelMenu slices={slices} onBack={onBack} onClose={onClose} />;
}

/**
 * Shown BEFORE rolling, so the player can gauge the risk (a fixed die means
 * a fixed range, but which exact outcome charges what wasn't visible
 * before) — a real playtest request (2026-07-30). The final charged amount,
 * AFTER rolling, is covered by DiceHUD's own caption instead (it already
 * shows the roll result itself). Split out of PlayerActionWheel purely to
 * stay under this codebase's eslint complexity limit, same established
 * pattern as prior complexity fixes elsewhere (see project memory).
 */
function NightsPreviewPanel({ lot }: { lot: HotelLot | null }) {
  if (!lot) return null;
  return (
    <div className={styles.nightsPreview}>
      <span className={styles.nightsPreviewTitle}>{lot.name}: hány éjszaka?</span>
      <div className={styles.nightsPreviewRow}>
        {[1, 2, 3, 4, 5, 6].map((nights) => (
          <span key={nights}>
            {nights}: {computeNightlyRent(lot, nights)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * What's actually up for auction was previously only ever named ("Alice:
 * +100" bidding slices, nothing else) — a real playtest request
 * (2026-07-30): the full property data (same as at purchase time), not
 * just the hotel's name. Split out for the same complexity reason as
 * NightsPreviewPanel above.
 */
function AuctionSubjectPanel({
  lot,
  auction,
  onInspect,
}: {
  lot: HotelLot | null;
  auction: HotelState['pendingAuction'];
  onInspect: () => void;
}) {
  if (!lot || !auction) return null;
  return (
    <button className={styles.auctionSubject} onClick={onInspect}>
      <span>Árverés: {lot.name}</span>
      <span className={styles.auctionSubjectBid}>Legmagasabb: {auction.highestBid}</span>
    </button>
  );
}

/**
 * Replaces the wheel entirely while AUCTION_IN_PROGRESS (2026-08-04 redesign
 * — bidding is now strictly sequential, one bidder at a time, per
 * `pendingAuction.currentBidderId`, with a freely-typed amount instead of a
 * fixed +100-per-click wheel slice). `interactive` mirrors the wheel's own
 * online-mode gating (not this client's turn to bid = every control disabled).
 */
function AuctionBidPanel({
  state,
  dispatch,
  interactive,
}: {
  state: HotelState;
  dispatch: (action: HotelAction) => void;
  interactive: boolean;
}) {
  const auction = state.pendingAuction;
  const [amountText, setAmountText] = useState('');

  // A fresh typing slate every time it becomes a (possibly different)
  // player's turn to act, or the price moves — the previous bidder's typed
  // number is meaningless once it's someone else's turn.
  useEffect(() => {
    setAmountText('');
  }, [auction?.currentBidderId, auction?.highestBid]);

  if (!auction) return null;
  const bidder = state.players.find((p) => p.id === auction.currentBidderId);
  if (!bidder) return null;
  const bidderId = bidder.id;

  const minimumBid = auction.highestBid + 1;
  const parsedAmount = Number(amountText);
  const isValidNumber = amountText.trim() !== '' && Number.isInteger(parsedAmount);
  const canBid = interactive && isValidNumber && canPlaceBid(state, bidderId, parsedAmount);
  const canPass = interactive && canPassBid(state, bidderId);

  function placeBid(): void {
    if (canBid) dispatch({ type: 'PLACE_BID', bidderId, amount: parsedAmount });
  }

  function pass(): void {
    if (canPass) dispatch({ type: 'PASS_BID', bidderId });
  }

  return (
    <div className={[styles.auctionBid, !interactive && styles.readOnly].filter(Boolean).join(' ')}>
      <p className={styles.auctionBidTurn}>{bidder.name} köre: licitálj vagy passzolj</p>
      <div className={styles.auctionBidRow}>
        <input
          type="number"
          className={styles.auctionBidInput}
          min={minimumBid}
          step={1}
          value={amountText}
          placeholder={String(minimumBid)}
          disabled={!interactive}
          onChange={(event) => setAmountText(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && placeBid()}
        />
        <Button onClick={placeBid} disabled={!canBid}>
          Licitál
        </Button>
      </div>
      <Button variant="secondary" onClick={pass} disabled={!canPass}>
        Passzol
      </Button>
    </div>
  );
}

function lotOrNull(state: HotelState, lotId: string | null | undefined): HotelLot | null {
  return lotId ? getLot(state, lotId) : null;
}

function ConstructionSelectionPanel({
  state,
  interactive,
  pending,
  totalCost,
  currentPlayerId,
  onRemove,
  onCancel,
  onBuildWithoutPermit,
  onConfirm,
}: {
  state: HotelState;
  interactive: boolean;
  pending: ConstructionPlanItem[];
  totalCost: number;
  currentPlayerId: string;
  onRemove: (lotId: string) => void;
  onCancel: () => void;
  onBuildWithoutPermit: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className={[styles.selectionPanel, !interactive && styles.readOnly].filter(Boolean).join(' ')}>
      <h3>Kiválasztott építkezések</h3>
      <ul>
        {pending.map((item) => (
          <li key={item.lotId}>
            <span>
              {getLot(state, item.lotId).name}: {describeSelection(item)}
            </span>
            <button onClick={() => onRemove(item.lotId)} aria-label="Törlés">
              ×
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.selectionCost}>
        Össz. költség: {totalCost} (dupla dobásnál: {totalCost * 2})
      </p>
      <div className={styles.selectionActions}>
        <Button variant="secondary" onClick={onCancel}>
          Mégse
        </Button>
        {canBuildWithoutPermit(state, currentPlayerId, pending) && (
          <Button variant="secondary" onClick={onBuildWithoutPermit}>
            Építés dobás nélkül
          </Button>
        )}
        <Button onClick={onConfirm}>Építési engedélyt kér</Button>
      </div>
    </div>
  );
}

function AuctionFactsModal({ lot, open, onClose }: { lot: HotelLot | null; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open && lot !== null} onClose={onClose} className={modalTheme.hotelModal}>
      {lot && (
        <div className={styles.purchaseConfirm}>
          <h2>{lot.name}</h2>
          <HotelLotFacts lot={lot} />
        </div>
      )}
    </Modal>
  );
}

/**
 * Floating, collapsible radial action menu for the active player — see
 * docs/hotel-0a-specifikacio.md §5/§9 and assets/Hotel/UI-menu.png for the
 * requested look. Owns its own navigation stack (for the Építkezés -> telek
 * drill-down) and the in-progress, not-yet-sent multi-building construction
 * selection — both are transient UI state, not game state, so they live
 * here rather than in HotelState.
 */
export function PlayerActionWheel({
  state,
  dispatch,
  interactive = true,
  staircasePlacement,
  onStartStaircasePlacement,
  onCancelStaircasePlacement,
}: PlayerActionWheelProps) {
  const [open, setOpen] = useState(true);
  const [stack, setStack] = useState<MenuLevel[]>([{ kind: 'root' }]);
  const [pending, setPending] = useState<ConstructionPlanItem[]>([]);
  const [forfeitConfirmOpen, setForfeitConfirmOpen] = useState(false);
  const [pendingPurchaseLotId, setPendingPurchaseLotId] = useState<string | null>(null);
  const [auctionFactsOpen, setAuctionFactsOpen] = useState(false);

  const currentPlayer = getCurrentPlayer(state);

  // A fresh landing or a new player's turn always starts back at the wheel's root.
  useEffect(() => {
    setStack([{ kind: 'root' }]);
    setPending([]);
    setForfeitConfirmOpen(false);
    setPendingPurchaseLotId(null);
  }, [state.currentPlayerIndex, currentPlayer.position]);

  function push(level: MenuLevel): void {
    setStack((prev) => [...prev, level]);
  }

  // Choosing a lot for a paid staircase right leaves the (now pointless)
  // lot-list submenu and arms the board-click picker — mirrors
  // dispatchAndReturnToRoot's "every slice that resolves something returns to
  // root" convention, just without a dispatch yet (the space still isn't chosen).
  function startStaircasePlacement(mode: StaircasePlacementMode): void {
    onStartStaircasePlacement(mode);
    setStack([{ kind: 'root' }]);
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

  // Only ever enabled for a garden-only selection — the engine rejects
  // anything else (docs/hotel-0a-specifikacio.md §9.2, "kert engedély nélkül").
  function confirmWithoutPermit(): void {
    if (pending.length === 0) return;
    dispatch({ type: 'BUILD_WITHOUT_PERMIT', plan: pending });
    setPending([]);
    setStack([{ kind: 'root' }]);
  }

  function confirmForfeit(): void {
    setForfeitConfirmOpen(false);
    dispatchAndReturnToRoot({ type: 'FORFEIT' });
  }

  function confirmPurchase(lotId: string): void {
    setPendingPurchaseLotId(null);
    dispatchAndReturnToRoot({ type: 'BUY_LOT', lotId });
  }

  if (!open) {
    return (
      <button className={styles.collapsedButton} onClick={() => setOpen(true)}>
        {currentPlayer.name}
      </button>
    );
  }

  const level = stack[stack.length - 1];
  const rawSlices = computeSlices(
    level,
    state,
    dispatchAndReturnToRoot,
    { push },
    pending,
    addToPending,
    () => setForfeitConfirmOpen(true),
    startStaircasePlacement,
    setPendingPurchaseLotId,
  );
  const slices = resolveSlices(rawSlices, interactive, staircasePlacement);
  // Shown so the player can weigh the risk before requesting the permit — a
  // DOUBLE permit-die roll charges this amount twice (a RED roll charges nothing).
  const totalCost = pending.reduce((sum, item) => sum + computeConstructionCost(getLot(state, item.lotId), item), 0);

  const auctionLot = lotOrNull(state, state.pendingAuction?.lotId);
  // Shown BEFORE rolling, so the player can gauge the risk (a fixed die
  // means a fixed range, but which exact outcome charges what wasn't
  // visible before) — a real playtest request (2026-07-30). The final
  // charged amount, AFTER rolling, is covered by DiceHUD's own caption
  // instead (it already shows the roll result itself).
  const nightsPreviewLot = lotOrNull(state, state.pendingNightsRollLotId);

  return (
    <>
      <div className={[styles.container, !interactive && styles.readOnly].filter(Boolean).join(' ')}>
        <div className={styles.playerLabel}>{currentPlayer.name}</div>
        {/* Wheel above the dice, not below — a real playtest request
            (2026-07-30): the menu is what's actually interacted with every
            turn, the dice result is secondary reference info. */}
        <WheelOrOverlay
          staircasePlacement={staircasePlacement}
          onCancelStaircasePlacement={onCancelStaircasePlacement}
          state={state}
          dispatch={dispatch}
          interactive={interactive}
          slices={slices}
          onBack={stack.length > 1 ? back : undefined}
          onClose={() => setOpen(false)}
        />
        <DiceHUD state={state} />
        <NightsPreviewPanel lot={nightsPreviewLot} />
        <AuctionSubjectPanel lot={auctionLot} auction={state.pendingAuction} onInspect={() => setAuctionFactsOpen(true)} />
      </div>
      {/* On the LEFT side, not stacked under the wheel — more room there, and
          the wheel's own column stays a predictable, fixed height. Capped to
          the canvas's own height (top+bottom, not a fixed height) with
          internal scrolling, so a long plan can never grow the PAGE taller
          than the canvas and force a page-level scrollbar. */}
      {pending.length > 0 && (
        <ConstructionSelectionPanel
          state={state}
          interactive={interactive}
          pending={pending}
          totalCost={totalCost}
          currentPlayerId={currentPlayer.id}
          onRemove={removeFromPending}
          onCancel={cancelConstruction}
          onBuildWithoutPermit={confirmWithoutPermit}
          onConfirm={confirmConstruction}
        />
      )}
      <Modal
        open={forfeitConfirmOpen}
        onClose={() => setForfeitConfirmOpen(false)}
        className={modalTheme.hotelModal}
      >
        <h2>Feladod a játékot?</h2>
        <p>Minden telked a bankhoz kerül, és kiesel a játékból. Ez nem vonható vissza.</p>
        <div className={styles.selectionActions}>
          <Button variant="secondary" onClick={() => setForfeitConfirmOpen(false)}>
            Mégse
          </Button>
          <Button onClick={confirmForfeit}>Igen, feladom</Button>
        </div>
      </Modal>
      <PurchaseConfirmModal
        state={state}
        lotId={pendingPurchaseLotId}
        onConfirm={confirmPurchase}
        onCancel={() => setPendingPurchaseLotId(null)}
      />
      <AuctionFactsModal lot={auctionLot} open={auctionFactsOpen} onClose={() => setAuctionFactsOpen(false)} />
    </>
  );
}
