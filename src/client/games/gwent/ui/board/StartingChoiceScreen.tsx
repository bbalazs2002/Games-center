import { useState } from 'react';
import { assetUrl } from '../../../../core/assetUrl';
import { Button } from '../../../../ui-kit/Button';
import { canChooseStartingPlayer, canFlipStartingCoin, scoiaTaelDecisivePlayerId } from '../../../../../shared/games/gwent/engine/rules';
import type { GwentAction } from '../../../../../shared/games/gwent/engine/actions';
import type { GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import styles from './matchBoard.module.css';

export interface StartingChoiceScreenProps {
  state: GwentState;
  dispatch: (action: GwentAction) => void;
  /** Online mode only — when set and this player isn't the Scoia'tael decider, the choice buttons are hidden (they'd silently no-op server-side anyway). The coin-flip button stays enabled for both — either side may legitimately trigger it. */
  myPlayer?: PlayerId;
}

/** AWAITING_START_CHOICE — round 1 only: either a coin flip (2026-08-04 clarification: token-coin-castle/torch, matches the real game's "coin toss" convention) or, if exactly one player's faction is Scoia'tael, that player's explicit pick. From round 2 onward this phase is never re-entered for the Scoia'tael reason (real-rule correction, 2026-08-04) — the previous round's loser simply starts, same as every other faction. */
export function StartingChoiceScreen({ state, dispatch, myPlayer }: StartingChoiceScreenProps) {
  const [flipping, setFlipping] = useState(false);
  const decisivePlayerId = scoiaTaelDecisivePlayerId(state);

  if (decisivePlayerId) {
    const chooser = state.players.find((p) => p.id === decisivePlayerId)!;
    if (myPlayer && myPlayer !== decisivePlayerId) {
      return (
        <div className={styles.startingChoiceScreen}>
          <h2>Várakozás</h2>
          <p>{chooser.name} (Scoia'tael) dönti el, ki kezdjen…</p>
        </div>
      );
    }
    return (
      <div className={styles.startingChoiceScreen}>
        <h2>{chooser.name} (Scoia'tael) dönt: ki kezdjen?</h2>
        <div className={styles.matchActions}>
          {state.players.map((p) => (
            <Button
              key={p.id}
              disabled={!canChooseStartingPlayer(state, decisivePlayerId)}
              onClick={() => dispatch({ type: 'CHOOSE_STARTING_PLAYER', playerId: decisivePlayerId, chosenPlayerId: p.id })}
            >
              {p.name} kezdjen
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const lastFlip = [...state.log].reverse().find((e) => e.type === 'STARTING_COIN_FLIP');

  return (
    <div className={styles.startingChoiceScreen}>
      <h2>Pénzfeldobás dönti el, ki kezd</h2>
      <div className={styles.coinRow}>
        <img className={styles.coinImage} src={assetUrl('/assets/gwent/icons/token-coin-castle.png')} alt="Vár" />
        <img className={styles.coinImage} src={assetUrl('/assets/gwent/icons/token-coin-torch.png')} alt="Fáklya" />
      </div>
      {lastFlip && lastFlip.type === 'STARTING_COIN_FLIP' && (
        <p>Eredmény: {lastFlip.result === 'castle' ? 'Vár' : 'Fáklya'} — kezd: {state.players.find((p) => p.id === lastFlip.startingPlayerId)?.name}</p>
      )}
      <Button
        disabled={!canFlipStartingCoin(state) || flipping}
        onClick={() => {
          setFlipping(true);
          window.setTimeout(() => {
            dispatch({ type: 'FLIP_STARTING_COIN' });
            setFlipping(false);
          }, 400);
        }}
      >
        Pénzfeldobás
      </Button>
    </div>
  );
}
