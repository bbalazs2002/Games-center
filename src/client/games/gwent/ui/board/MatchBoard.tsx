import { useState } from 'react';
import { Button } from '../../../../ui-kit/Button';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import { agileAutoOptimizes, medicPicksRandomTarget } from '../../../../../shared/games/gwent/engine/leaderPassives';
import { canPass, eligibleMedicTargets, getCurrentPlayer, getPlayer } from '../../../../../shared/games/gwent/engine/rules';
import { getValidActions } from '../../../../../shared/games/gwent/engine/selectors';
import type { GwentAction } from '../../../../../shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import type { Row } from '../../../../../shared/games/gwent/engine/types';
import { CardFlightProvider } from './cardFlight';
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
   * Local hot-seat mode only — whichever player should render at the bottom
   * of the screen (Gwent-0c: "the board rotates so the acting player's side
   * is always at the bottom", requested 2026-08-04) — GwentGamePage passes
   * its `activeViewerId` here. Undefined (including always in online mode,
   * where rotation was explicitly NOT requested) falls back to the fixed,
   * positional `state.players[0]`/`[1]` order.
   */
  bottomViewerId?: PlayerId;
  /** Passed straight through to each PlayerBoardZone's LeaderAbilityPanel — see its own doc comment. */
  requestDeckReveal: (playerId: PlayerId) => Promise<CardInstance[]>;
}

type FollowUp = 'row' | 'decoy' | 'medic' | null;

function cardFollowUp(state: GwentState, actingPlayerId: string, defId: string): FollowUp {
  const def = getCardDef(defId);
  if (def.kind === 'Decoy') return 'decoy';
  if (def.kind === 'Horn') return 'row';
  if (def.kind === 'Unit' && def.abilities.includes('Agile') && !agileAutoOptimizes(getPlayer(state, actingPlayerId))) return 'row';
  if (def.kind === 'Unit' && def.abilities.includes('Medic') && !medicPicksRandomTarget(state)) return 'medic';
  return null;
}

const ROW_LABELS: Record<Row, string> = { Melee: 'Közelharc', Ranged: 'Távolsági', Siege: 'Ostrom' };

/** Orchestrates the ROUND_IN_PROGRESS/ROUND_RESOLVED phases: both board zones, the acting player's hand, the play-flow state machine (row/Decoy-target/Medic follow-ups), and pass. Each PlayerBoardZone owns its own leader panel/deck/discard now (Gwent-0c). */
export function MatchBoard({ state, dispatch, myPlayer, bottomViewerId, requestDeckReveal }: MatchBoardProps) {
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);

  const actingPlayer = getCurrentPlayer(state);
  const isMyTurn = myPlayer === undefined || myPlayer === actingPlayer.id;
  const viewerId = myPlayer ?? bottomViewerId;
  const bottomPlayer = bottomViewerId ? getPlayer(state, bottomViewerId) : state.players[0];
  const topPlayer = state.players.find((p) => p.id !== bottomPlayer.id)!;
  const valid = getValidActions(state, actingPlayer.id);
  const playableIds = new Set(valid.playableCards.map((p) => p.instanceId));

  function selectCard(instanceId: string): void {
    const instance = actingPlayer.hand.find((c) => c.instanceId === instanceId);
    if (!instance) return;
    const followUp = cardFollowUp(state, actingPlayer.id, instance.defId);
    if (!followUp) {
      dispatch({ type: 'PLAY_CARD', playerId: actingPlayer.id, instanceId });
      return;
    }
    setPendingCardId(instanceId);
  }

  function cancelPending(): void {
    setPendingCardId(null);
  }

  const pendingInstance = pendingCardId ? actingPlayer.hand.find((c) => c.instanceId === pendingCardId) : null;
  const pendingDef = pendingInstance ? getCardDef(pendingInstance.defId) : null;
  const pendingFollowUp = pendingInstance ? cardFollowUp(state, actingPlayer.id, pendingInstance.defId) : null;

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
          decoyTargetSelectable={pendingFollowUp === 'decoy' && actingPlayer.id === topPlayer.id}
          onSelectTarget={(instanceId) => {
            dispatch({ type: 'PLAY_CARD', playerId: actingPlayer.id, instanceId: pendingCardId as string, decoyTargetInstanceId: instanceId });
            setPendingCardId(null);
          }}
        />

        <div className={styles.weatherBar}>
          {(['Melee', 'Ranged', 'Siege'] as Row[]).map((row) => (
            <span key={row} className={state.activeWeatherRows.includes(row) ? styles.weatherActive : undefined}>
              {ROW_LABELS[row]} {state.activeWeatherRows.includes(row) ? '❄️' : ''}
            </span>
          ))}
          <span>{state.round}. kör</span>
        </div>

        <PlayerBoardZone
          state={state}
          playerId={bottomPlayer.id}
          dispatch={dispatch}
          outer={false}
          viewerId={viewerId}
          requestDeckReveal={requestDeckReveal}
          decoyTargetSelectable={pendingFollowUp === 'decoy' && actingPlayer.id === bottomPlayer.id}
          onSelectTarget={(instanceId) => {
            dispatch({ type: 'PLAY_CARD', playerId: actingPlayer.id, instanceId: pendingCardId as string, decoyTargetInstanceId: instanceId });
            setPendingCardId(null);
          }}
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

              {pendingFollowUp === 'row' && pendingDef && (
                <div className={styles.targetPicker}>
                  <p>Válassz sort:</p>
                  {(pendingDef.kind === 'Horn' ? (['Melee', 'Ranged', 'Siege'] as Row[]) : (['Melee', 'Ranged'] as Row[])).map((row) => (
                    <Button
                      key={row}
                      variant="secondary"
                      onClick={() => {
                        dispatch({ type: 'PLAY_CARD', playerId: actingPlayer.id, instanceId: pendingCardId as string, chosenRow: row });
                        setPendingCardId(null);
                      }}
                    >
                      {ROW_LABELS[row]}
                    </Button>
                  ))}
                  <Button variant="secondary" onClick={cancelPending}>
                    Mégse
                  </Button>
                </div>
              )}

              {pendingFollowUp === 'decoy' && (
                <div className={styles.targetPicker}>
                  <p>Válassz egy saját lapot a táblán, amit visszaveszel a kezedbe.</p>
                  <Button variant="secondary" onClick={cancelPending}>
                    Mégse
                  </Button>
                </div>
              )}

              {pendingFollowUp === 'medic' && pendingCardId && (
                <div className={styles.targetPicker}>
                  <p>Válassz egy lapot a dobott lapjaid közül (vagy hagyd ki):</p>
                  {eligibleMedicTargets(actingPlayer).map((c) => (
                    <Button
                      key={c.instanceId}
                      variant="secondary"
                      onClick={() => {
                        dispatch({ type: 'PLAY_CARD', playerId: actingPlayer.id, instanceId: pendingCardId, medicReviveInstanceId: c.instanceId });
                        setPendingCardId(null);
                      }}
                    >
                      {getCardDef(c.defId).name}
                    </Button>
                  ))}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      dispatch({ type: 'PLAY_CARD', playerId: actingPlayer.id, instanceId: pendingCardId });
                      setPendingCardId(null);
                    }}
                  >
                    Kihagyás
                  </Button>
                </div>
              )}

              {!pendingFollowUp && (
                <>
                  <HandArea
                    hand={actingPlayer.hand}
                    ownerId={actingPlayer.id}
                    playableInstanceIds={playableIds}
                    selectedInstanceId={pendingCardId}
                    onSelectCard={selectCard}
                  />
                  <Button disabled={!canPass(state, actingPlayer.id)} onClick={() => dispatch({ type: 'PASS', playerId: actingPlayer.id })}>
                    Passz
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {state.phase === 'ROUND_RESOLVED' && <RoundSummaryModal state={state} dispatch={dispatch} />}
      </div>
    </CardFlightProvider>
  );
}
