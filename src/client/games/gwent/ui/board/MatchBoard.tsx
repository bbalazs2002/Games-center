import { useState } from 'react';
import { Button } from '../../../../ui-kit/Button';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import { agileAutoOptimizes, medicPicksRandomTarget } from '../../../../../shared/games/gwent/engine/leaderPassives';
import { canPass, eligibleMedicTargets, getCurrentPlayer, getPlayer } from '../../../../../shared/games/gwent/engine/rules';
import { getValidActions } from '../../../../../shared/games/gwent/engine/selectors';
import type { GwentAction } from '../../../../../shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import type { CardDef, Row } from '../../../../../shared/games/gwent/engine/types';
import { ActiveWeatherZone } from './ActiveWeatherZone';
import { EyeIcon } from './boardIcons';
import { CardCarouselModal, type CarouselEntry } from './CardCarouselModal';
import { CardFlightProvider } from './cardFlight';
import { CardTile } from './CardTile';
import { GwentLogPanel } from './GwentLogPanel';
import { HandArea } from './HandArea';
import { PlayerBoardZone } from './PlayerBoardZone';
import { RoundSummaryModal } from './RoundSummaryModal';
import styles from './matchBoard.module.css';

export interface MatchBoardProps {
  state: GwentState;
  dispatch: (action: GwentAction) => void;
  /**
   * Online mode only — when set and it's NOT this player's turn, the hand
   * section is replaced with a waiting message instead of rendering the
   * (masked, from this viewer's perspective) opponent hand as if it were
   * interactive. Omitted in local hot-seat mode, where whoever's turn it is
   * IS the local viewer (enforced by GwentGamePage's pass-device gate) —
   * see docs/gwent-0b-multiplayer-specifikacio.md §6.
   */
  myPlayer?: PlayerId;
  /**
   * Whichever player should render at the bottom of the screen. Local
   * hot-seat mode: GwentGamePage passes its `activeViewerId` here, which
   * changes across PassDeviceScreen hand-offs (Gwent-0c: "the board rotates
   * so the acting player's side is always at the bottom"). Online mode
   * (Gwent-0c.1 §H, 19. pont): GwentGamePage passes the constant `myPlayer`
   * instead — the local viewer never changes mid-match online, so this is a
   * fixed placement with no rotation animation, exactly as requested
   * ("ne forogjon, de mindig a helyi játékosé legyen az alsó rész").
   * Undefined falls back to the fixed, positional `state.players[0]`/`[1]` order.
   */
  bottomViewerId?: PlayerId;
  /** Passed straight through to each PlayerBoardZone's LeaderAbilityPanel — see its own doc comment. */
  requestDeckReveal: (playerId: PlayerId) => Promise<CardInstance[]>;
}

const ALL_ROWS: Row[] = ['Melee', 'Ranged', 'Siege'];

/**
 * The row(s) a confirmed card may be placed on — a single fixed row for
 * anything without a real choice (the engine's `rules.ts` `isRowChoiceValid`
 * REJECTS a `chosenRow` for those, see Gwent-0c.1 §2), Melee+Ranged for a
 * non-auto-optimized Agile unit, or all 3 for Horn.
 *
 * Gwent-0c.4 §M: Weather AND Scorch always have `def.row === null` (their
 * real target is `def.weatherRow`, or "every row on both sides" for Scorch)
 * — falling through to the old `def.row ? [def.row] : []` default meant
 * NEITHER kind ever had a selectable row, so the row-pick UI could never be
 * satisfied and PLAY_CARD never dispatched for them. The click here is a
 * pure UI confirmation gesture either way — `chosenRow` is never read by the
 * reducer for these two kinds (`applyWeatherEffect`/the Scorch branch both
 * ignore it), so which specific row gets clicked (when there's more than
 * one) makes no functional difference.
 */
function selectableRowsFor(state: GwentState, actingPlayerId: string, defId: string): Row[] {
  const def = getCardDef(defId);
  if (def.kind === 'Horn') return ALL_ROWS;
  if (def.kind === 'Scorch') return ALL_ROWS;
  if (def.kind === 'Weather') return def.weatherRow === 'AllRows' || def.weatherRow === null ? ALL_ROWS : [def.weatherRow];
  if (def.kind === 'Unit' && def.abilities.includes('Agile') && !agileAutoOptimizes(getPlayer(state, actingPlayerId))) return ['Melee', 'Ranged'];
  return def.row ? [def.row] : [];
}

function needsMedicStep(state: GwentState, defId: string): boolean {
  const def = getCardDef(defId);
  return def.kind === 'Unit' && def.abilities.includes('Medic') && !medicPicksRandomTarget(state);
}

/** Orchestrates the ROUND_IN_PROGRESS/ROUND_RESOLVED phases: both board zones, the acting player's hand, the play-flow state machine (row → optional Medic follow-up, or Decoy-target), and pass. Each PlayerBoardZone owns its own leader panel/deck/discard now (Gwent-0c). */
export function MatchBoard({ state, dispatch, myPlayer, bottomViewerId, requestDeckReveal }: MatchBoardProps) {
  // The selected-for-play hand card (Gwent-0c.2 §K: clicking selects
  // directly, no confirm-modal step anymore — that was the 0c.1 design, the
  // felhasználó explicitly reverted it). A row click is ALWAYS required next
  // (even for a fixed single-row card — see selectRow below), then an
  // optional Medic sub-step.
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  const [pendingChosenRow, setPendingChosenRow] = useState<Row | null>(null);
  // Gwent-0c.4 §11: a Medic revival's OWN Medic ability gets a real pick too
  // (not a silent decline) — collected client-side as an ordered chain,
  // reusing this SAME picker panel level by level (no separate UI), then
  // sent as one PLAY_CARD once the chain stops (a non-Medic pick, or "Kihagyás").
  const [medicChain, setMedicChain] = useState<string[]>([]);
  // "Nézegetés" mode (Gwent-0c.2 §K, 12. pont): while on, clicking a hand
  // card opens the read-only carousel inspector instead of selecting it for play.
  const [viewMode, setViewMode] = useState(false);
  // Gwent-0d §2/§4: ONE shared carousel instance for the whole board — a
  // group is always exactly one of: the acting player's hand, one board
  // row's cards, one discard pile, or the active weather cards. Never mixed.
  const [carousel, setCarousel] = useState<{ entries: CarouselEntry[]; initialIndex: number } | null>(null);

  function openCardGroup(cards: CardInstance[], initialIndex: number): void {
    setCarousel({ entries: cards.map((instance) => ({ type: 'card', instance })), initialIndex });
  }

  function openCatalogGroup(defs: CardDef[], initialIndex: number): void {
    setCarousel({ entries: defs.map((def) => ({ type: 'catalog', def })), initialIndex });
  }

  const actingPlayer = getCurrentPlayer(state);
  const isMyTurn = myPlayer === undefined || myPlayer === actingPlayer.id;
  const viewerId = myPlayer ?? bottomViewerId;
  const bottomPlayer = bottomViewerId ? getPlayer(state, bottomViewerId) : state.players[0];
  const topPlayer = state.players.find((p) => p.id !== bottomPlayer.id)!;
  const valid = getValidActions(state, actingPlayer.id);
  const playableIds = new Set(valid.playableCards.map((p) => p.instanceId));

  function selectCard(instanceId: string): void {
    if (viewMode) {
      const index = actingPlayer.hand.findIndex((c) => c.instanceId === instanceId);
      if (index >= 0) openCardGroup(actingPlayer.hand, index);
      return;
    }
    setPendingCardId((prev) => (prev === instanceId ? null : instanceId));
    setPendingChosenRow(null);
  }

  function cancelPending(): void {
    setPendingCardId(null);
    setPendingChosenRow(null);
    setMedicChain([]);
  }

  function selectRow(row: Row): void {
    if (!pendingCardId || !pendingInstance) return;
    if (needsMedicStep(state, pendingInstance.defId)) {
      setPendingChosenRow(row);
      return;
    }
    const rows = selectableRowsFor(state, actingPlayer.id, pendingInstance.defId);
    dispatch({ type: 'PLAY_CARD', playerId: actingPlayer.id, instanceId: pendingCardId, chosenRow: rows.length > 1 ? row : undefined });
    cancelPending();
  }

  function dispatchPendingPlay(chain: string[]): void {
    if (!pendingCardId || !pendingInstance || pendingChosenRow === null) return;
    const rows = selectableRowsFor(state, actingPlayer.id, pendingInstance.defId);
    dispatch({
      type: 'PLAY_CARD',
      playerId: actingPlayer.id,
      instanceId: pendingCardId,
      chosenRow: rows.length > 1 ? pendingChosenRow : undefined,
      medicReviveInstanceIds: chain.length > 0 ? chain : undefined,
    });
    cancelPending();
  }

  /**
   * `undefined` = "Kihagyás" at the current chain depth — finalizes with
   * whatever was already picked. Otherwise: append to the chain, and if the
   * JUST-picked card is itself Medic-ability, stay in this SAME picker for
   * its own revival target (Gwent-0c.4 §11) instead of dispatching yet.
   */
  function selectMedicTarget(pickedInstanceId?: string): void {
    if (pickedInstanceId === undefined) {
      dispatchPendingPlay(medicChain);
      return;
    }
    const nextChain = [...medicChain, pickedInstanceId];
    const pickedDef = getCardDef(actingPlayer.discard.find((c) => c.instanceId === pickedInstanceId)!.defId);
    if (pickedDef.abilities.includes('Medic')) {
      setMedicChain(nextChain);
    } else {
      dispatchPendingPlay(nextChain);
    }
  }

  const pendingInstance = pendingCardId ? actingPlayer.hand.find((c) => c.instanceId === pendingCardId) : null;
  const pendingDef = pendingInstance ? getCardDef(pendingInstance.defId) : null;
  const isDecoy = pendingDef?.kind === 'Decoy';
  const awaitingRowPick = !!pendingInstance && !isDecoy && pendingChosenRow === null;
  const awaitingMedicPick = !!pendingInstance && pendingChosenRow !== null;
  const selectableRows = awaitingRowPick && pendingInstance ? new Set(selectableRowsFor(state, actingPlayer.id, pendingInstance.defId)) : null;
  const opponent = state.players.find((p) => p.id !== actingPlayer.id)!;
  // Gwent-0c.4 §G: a Spy card lands on the OPPONENT's board (the engine's
  // `resolveUnitPlay` already redirects it there regardless of which zone
  // the row-click happened in) — the row-pick highlight now follows suit, so
  // the player clicks a row on the side the card is ACTUALLY going to,
  // instead of their own (which is what used to happen, purely a client bug).
  const rowPickOwnerId = pendingDef?.abilities.includes('Spy') ? opponent.id : actingPlayer.id;

  return (
    <CardFlightProvider log={state.log}>
      <div className={styles.matchBoard}>
        <PlayerBoardZone
          state={state}
          playerId={topPlayer.id}
          dispatch={dispatch}
          outer
          viewerId={viewerId}
          requestDeckReveal={requestDeckReveal}
          decoyTargetSelectable={isDecoy && actingPlayer.id === topPlayer.id}
          onSelectTarget={(instanceId) => {
            dispatch({ type: 'PLAY_CARD', playerId: actingPlayer.id, instanceId: pendingCardId as string, decoyTargetInstanceId: instanceId });
            cancelPending();
          }}
          selectableRows={rowPickOwnerId === topPlayer.id ? (selectableRows ?? undefined) : undefined}
          onSelectRow={selectRow}
          onOpenCardGroup={openCardGroup}
        />

        <ActiveWeatherZone activeWeatherRows={state.activeWeatherRows} onOpenGroup={openCatalogGroup} />

        <PlayerBoardZone
          state={state}
          playerId={bottomPlayer.id}
          dispatch={dispatch}
          outer={false}
          viewerId={viewerId}
          requestDeckReveal={requestDeckReveal}
          decoyTargetSelectable={isDecoy && actingPlayer.id === bottomPlayer.id}
          onSelectTarget={(instanceId) => {
            dispatch({ type: 'PLAY_CARD', playerId: actingPlayer.id, instanceId: pendingCardId as string, decoyTargetInstanceId: instanceId });
            cancelPending();
          }}
          selectableRows={rowPickOwnerId === bottomPlayer.id ? (selectableRows ?? undefined) : undefined}
          onSelectRow={selectRow}
          onOpenCardGroup={openCardGroup}
        />

        {!isMyTurn && (
          <div className={styles.actionBar}>
            <p className={styles.turnLabel}>{actingPlayer.name} köre — várakozás…</p>
          </div>
        )}

        {isMyTurn && (
          <div className={styles.actionBar}>
            <div className={styles.handSection}>
              <p className={styles.turnLabel}>{actingPlayer.name} köre</p>

              {/*
                Gwent-0c.4 §N: the "Mégse" button that used to sit in each of
                these 3 panels is gone — clicking the already-selected hand
                card again (selectCard, above) does the exact same
                cancelPending() call, so the extra button was pure
                redundancy. The Medic panel's "Kihagyás" stays — that means
                something different (decline the revival, not cancel the play).
              */}
              {awaitingRowPick && pendingDef && (
                <div className={styles.targetPicker}>
                  <p>Válassz sort a táblán a(z) {pendingDef.name} lapnak — a kiemelt sorra kattintva.</p>
                </div>
              )}

              {isDecoy && (
                <div className={styles.targetPicker}>
                  <p>Válassz egy saját lapot a táblán, amit visszaveszel a kezedbe.</p>
                </div>
              )}

              {awaitingMedicPick && (
                <div className={styles.targetPicker}>
                  <p>
                    {medicChain.length > 0
                      ? 'A feltámasztott lap maga is Gyógyász — válassz egy lapot a dobott lapjaid közül (vagy hagyd ki):'
                      : 'Válassz egy lapot a dobott lapjaid közül (vagy hagyd ki):'}
                  </p>
                  {eligibleMedicTargets(actingPlayer)
                    .filter((c) => !medicChain.includes(c.instanceId))
                    .map((c) => (
                      <CardTile key={c.instanceId} instance={c} size="medium" onClick={() => selectMedicTarget(c.instanceId)} />
                    ))}
                  <Button variant="secondary" onClick={() => selectMedicTarget(undefined)}>
                    Kihagyás
                  </Button>
                </div>
              )}

              {/*
                Gwent-0c.3 §5: the hand used to unmount entirely the moment a
                card was selected (replaced by the follow-up panel above) —
                a real report ("ne tűnjenek el a lapjaim"). It now always
                stays visible; only the selected tile itself grows/lifts
                (`.cardSelected`, matchBoard.module.css) to show what's active.
              */}
              <div className={styles.handSectionControls}>
                <Button variant="secondary" onClick={() => setViewMode((v) => !v)}>
                  <EyeIcon /> {viewMode ? 'Nézegető mód (aktív)' : 'Nézegető mód'}
                </Button>
                <Button disabled={!canPass(state, actingPlayer.id)} onClick={() => dispatch({ type: 'PASS', playerId: actingPlayer.id })}>
                  Passz
                </Button>
              </div>
              <HandArea
                hand={actingPlayer.hand}
                ownerId={actingPlayer.id}
                playableInstanceIds={playableIds}
                selectedInstanceId={pendingCardId}
                onSelectCard={selectCard}
              />
            </div>
          </div>
        )}

        <CardCarouselModal entries={carousel?.entries ?? null} initialIndex={carousel?.initialIndex} onClose={() => setCarousel(null)} />

        {state.phase === 'ROUND_RESOLVED' && <RoundSummaryModal state={state} dispatch={dispatch} />}

        <GwentLogPanel state={state} />
      </div>
    </CardFlightProvider>
  );
}
