import { useState } from 'react';
import { Button } from '../../../../ui-kit/Button';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import { agileAutoOptimizes, medicPicksRandomTarget } from '../../../../../shared/games/gwent/engine/leaderPassives';
import { canPass, eligibleMedicTargets, getCurrentPlayer, getPlayer } from '../../../../../shared/games/gwent/engine/rules';
import { getValidActions } from '../../../../../shared/games/gwent/engine/selectors';
import type { GwentAction } from '../../../../../shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import type { Row } from '../../../../../shared/games/gwent/engine/types';
import { HandArea } from './HandArea';
import { LeaderAbilityPanel } from './LeaderAbilityPanel';
import { PlayerBoardZone } from './PlayerBoardZone';
import { RoundSummaryModal } from './RoundSummaryModal';
import styles from './matchBoard.module.css';

export interface MatchBoardProps {
  state: GwentState;
  dispatch: (action: GwentAction) => void;
  /**
   * Online mode only — when set and it's NOT this player's turn, the hand/
   * leader-panel/pass section is replaced with a waiting message instead of
   * rendering the (masked, from this viewer's perspective) opponent hand as
   * if it were interactive. Omitted in local hot-seat mode, where whoever's
   * turn it is IS the local viewer (enforced by GwentGamePage's pass-device
   * gate) — see docs/gwent-0b-multiplayer-specifikacio.md §6.
   */
  myPlayer?: PlayerId;
  /** Passed straight through to LeaderAbilityPanel — see its own doc comment. */
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

/** Orchestrates the ROUND_IN_PROGRESS/ROUND_RESOLVED phases: both board zones, the acting player's hand, the play-flow state machine (row/Decoy-target/Medic follow-ups), pass, and the leader panel. */
export function MatchBoard({ state, dispatch, myPlayer, requestDeckReveal }: MatchBoardProps) {
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);

  const actingPlayer = getCurrentPlayer(state);
  const isMyTurn = myPlayer === undefined || myPlayer === actingPlayer.id;
  const [bottomPlayer, topPlayer] = state.players;
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
    <div className={styles.matchBoard}>
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
        playerId={topPlayer.id}
        decoyTargetSelectable={pendingFollowUp === 'decoy' && actingPlayer.id === topPlayer.id}
        onSelectTarget={(instanceId) => {
          dispatch({ type: 'PLAY_CARD', playerId: actingPlayer.id, instanceId: pendingCardId as string, decoyTargetInstanceId: instanceId });
          setPendingCardId(null);
        }}
      />
      <PlayerBoardZone
        state={state}
        playerId={bottomPlayer.id}
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
        <LeaderAbilityPanel state={state} playerId={actingPlayer.id} dispatch={dispatch} requestDeckReveal={requestDeckReveal} />

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
              <HandArea hand={actingPlayer.hand} playableInstanceIds={playableIds} selectedInstanceId={pendingCardId} onSelectCard={selectCard} />
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
  );
}
