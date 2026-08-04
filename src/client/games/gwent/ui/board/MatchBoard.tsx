import { useState } from 'react';
import { Button } from '../../../../ui-kit/Button';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import { agileAutoOptimizes, medicPicksRandomTarget } from '../../../../../shared/games/gwent/engine/leaderPassives';
import { canPass, eligibleMedicTargets, getCurrentPlayer, getPlayer } from '../../../../../shared/games/gwent/engine/rules';
import { getValidActions } from '../../../../../shared/games/gwent/engine/selectors';
import type { GwentAction } from '../../../../../shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import type { Row } from '../../../../../shared/games/gwent/engine/types';
import { CardDetailModal } from '../CardDetailModal';
import { EyeIcon } from './boardIcons';
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

/** The row(s) a confirmed card may be placed on — a single fixed row for anything without a real choice (the engine's `rules.ts` `isRowChoiceValid` REJECTS a `chosenRow` for those, see Gwent-0c.1 §2), Melee+Ranged for a non-auto-optimized Agile unit, or all 3 for Horn. */
function selectableRowsFor(state: GwentState, actingPlayerId: string, defId: string): Row[] {
  const def = getCardDef(defId);
  if (def.kind === 'Horn') return ['Melee', 'Ranged', 'Siege'];
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
  // "Nézegetés" mode (Gwent-0c.2 §K, 12. pont): while on, clicking a hand
  // card opens a read-only CardDetailModal instead of selecting it for play.
  const [viewMode, setViewMode] = useState(false);
  const [zoomedHandInstance, setZoomedHandInstance] = useState<CardInstance | null>(null);

  const actingPlayer = getCurrentPlayer(state);
  const isMyTurn = myPlayer === undefined || myPlayer === actingPlayer.id;
  const viewerId = myPlayer ?? bottomViewerId;
  const bottomPlayer = bottomViewerId ? getPlayer(state, bottomViewerId) : state.players[0];
  const topPlayer = state.players.find((p) => p.id !== bottomPlayer.id)!;
  const valid = getValidActions(state, actingPlayer.id);
  const playableIds = new Set(valid.playableCards.map((p) => p.instanceId));

  function selectCard(instanceId: string): void {
    if (viewMode) {
      const instance = actingPlayer.hand.find((c) => c.instanceId === instanceId);
      if (instance) setZoomedHandInstance(instance);
      return;
    }
    setPendingCardId((prev) => (prev === instanceId ? null : instanceId));
    setPendingChosenRow(null);
  }

  function cancelPending(): void {
    setPendingCardId(null);
    setPendingChosenRow(null);
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

  function selectMedicTarget(medicReviveInstanceId?: string): void {
    if (!pendingCardId || !pendingInstance || pendingChosenRow === null) return;
    const rows = selectableRowsFor(state, actingPlayer.id, pendingInstance.defId);
    dispatch({
      type: 'PLAY_CARD',
      playerId: actingPlayer.id,
      instanceId: pendingCardId,
      chosenRow: rows.length > 1 ? pendingChosenRow : undefined,
      medicReviveInstanceId,
    });
    cancelPending();
  }

  const pendingInstance = pendingCardId ? actingPlayer.hand.find((c) => c.instanceId === pendingCardId) : null;
  const pendingDef = pendingInstance ? getCardDef(pendingInstance.defId) : null;
  const isDecoy = pendingDef?.kind === 'Decoy';
  const awaitingRowPick = !!pendingInstance && !isDecoy && pendingChosenRow === null;
  const awaitingMedicPick = !!pendingInstance && pendingChosenRow !== null;
  const selectableRows = awaitingRowPick && pendingInstance ? new Set(selectableRowsFor(state, actingPlayer.id, pendingInstance.defId)) : null;

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
          selectableRows={actingPlayer.id === topPlayer.id ? (selectableRows ?? undefined) : undefined}
          onSelectRow={selectRow}
        />

        <div className={styles.weatherBar}>
          <span className={styles.roundBadge}>{state.round}. kör</span>
        </div>

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
          selectableRows={actingPlayer.id === bottomPlayer.id ? (selectableRows ?? undefined) : undefined}
          onSelectRow={selectRow}
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

              {awaitingRowPick && pendingDef && (
                <div className={styles.targetPicker}>
                  <p>Válassz sort a táblán a(z) {pendingDef.name} lapnak — a kiemelt sorra kattintva.</p>
                  <Button variant="secondary" onClick={cancelPending}>
                    Mégse
                  </Button>
                </div>
              )}

              {isDecoy && (
                <div className={styles.targetPicker}>
                  <p>Válassz egy saját lapot a táblán, amit visszaveszel a kezedbe.</p>
                  <Button variant="secondary" onClick={cancelPending}>
                    Mégse
                  </Button>
                </div>
              )}

              {awaitingMedicPick && (
                <div className={styles.targetPicker}>
                  <p>Válassz egy lapot a dobott lapjaid közül (vagy hagyd ki):</p>
                  {eligibleMedicTargets(actingPlayer).map((c) => (
                    <CardTile key={c.instanceId} instance={c} size="medium" onClick={() => selectMedicTarget(c.instanceId)} />
                  ))}
                  <Button variant="secondary" onClick={() => selectMedicTarget(undefined)}>
                    Kihagyás
                  </Button>
                  <Button variant="secondary" onClick={cancelPending}>
                    Mégse
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

        <CardDetailModal card={zoomedHandInstance ? getCardDef(zoomedHandInstance.defId) : null} instance={zoomedHandInstance ?? undefined} onClose={() => setZoomedHandInstance(null)} />

        {state.phase === 'ROUND_RESOLVED' && <RoundSummaryModal state={state} dispatch={dispatch} />}

        <GwentLogPanel state={state} />
      </div>
    </CardFlightProvider>
  );
}
