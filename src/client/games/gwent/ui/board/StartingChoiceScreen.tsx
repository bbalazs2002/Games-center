import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../../../../core/assetUrl';
import { Button } from '../../../../ui-kit/Button';
import { canChooseStartingPlayer, canFlipStartingCoin, scoiaTaelDecisivePlayerId } from '@shared/games/gwent/engine/rules';
import type { GwentAction } from '@shared/games/gwent/engine/actions';
import type { GwentLogEntry, GwentState, PlayerId } from '@shared/games/gwent/engine/state';
import styles from './matchBoard.module.css';

type CoinFlipEntry = Extract<GwentLogEntry, { type: 'STARTING_COIN_FLIP' }>;

/** Purely cosmetic — how many extra full spins the coin does before settling on its real face. */
const SPIN_TURNS = 4;
const SPIN_MS = 900;

/**
 * A real, spinning coin (felhasználói kérés, 2026-08-08 — the old version just
 * showed both faces side by side, statically, the whole time). The RESULT
 * itself is decided by the reducer the instant `FLIP_STARTING_COIN` is
 * dispatched (local mode: synchronously; online: the next server message) —
 * this hook only decides how long to keep SHOWING a spin before revealing
 * that already-known result, via the same "diff new log entries since last
 * render" trick cardFlight.tsx uses for its own animations.
 */
function useCoinFlipAnimation(log: GwentState['log']) {
  const [spinning, setSpinning] = useState(false);
  const [landingDeg, setLandingDeg] = useState<number | null>(null);
  const previousLogLengthRef = useRef(log.length);

  useEffect(() => {
    const newEntries = log.length > previousLogLengthRef.current ? log.slice(previousLogLengthRef.current) : [];
    previousLogLengthRef.current = log.length;
    if (!spinning || landingDeg !== null) return;
    const flip = newEntries.find((entry): entry is CoinFlipEntry => entry.type === 'STARTING_COIN_FLIP');
    if (flip) setLandingDeg(360 * SPIN_TURNS + (flip.result === 'torch' ? 180 : 0));
  }, [log, spinning, landingDeg]);

  function startFlip() {
    setLandingDeg(null);
    setSpinning(true);
  }

  function handleLanded() {
    if (landingDeg === null) return;
    setSpinning(false);
    setLandingDeg(null);
  }

  return { spinning, landingDeg, startFlip, handleLanded };
}

export interface StartingChoiceScreenProps {
  state: GwentState;
  dispatch: (action: GwentAction) => void;
  /** Online mode only — when set and this player isn't the Scoia'tael decider, the choice buttons are hidden (they'd silently no-op server-side anyway). The coin-flip button stays enabled for both — either side may legitimately trigger it. */
  myPlayer?: PlayerId;
}

/** The whole "flip the coin" panel — split out of `StartingChoiceScreen` purely to keep that component under the project's complexity-10 ESLint limit. */
function CoinFlipPanel({ state, dispatch }: { state: GwentState; dispatch: (action: GwentAction) => void }) {
  const { spinning, landingDeg, startFlip, handleLanded } = useCoinFlipAnimation(state.log);
  const lastFlip = [...state.log].reverse().find((e): e is CoinFlipEntry => e.type === 'STARTING_COIN_FLIP');

  return (
    <>
      <div className={styles.coinStage}>
        <div
          className={[styles.coin, spinning && landingDeg === null && styles.coinSpinningUnknown].filter(Boolean).join(' ')}
          style={landingDeg !== null ? { transform: `rotateY(${landingDeg}deg)`, transitionDuration: `${SPIN_MS}ms` } : undefined}
          onTransitionEnd={handleLanded}
        >
          <img className={[styles.coinFace, styles.coinFaceFront].join(' ')} src={assetUrl('/assets/gwent/icons/token-coin-castle.png')} alt="Vár" />
          <img className={[styles.coinFace, styles.coinFaceBack].join(' ')} src={assetUrl('/assets/gwent/icons/token-coin-torch.png')} alt="Fáklya" />
        </div>
      </div>
      {!spinning && lastFlip && (
        <p>
          Eredmény: {lastFlip.result === 'castle' ? 'Vár' : 'Fáklya'} — kezd: {state.players.find((p) => p.id === lastFlip.startingPlayerId)?.name}
        </p>
      )}
      <Button
        disabled={!canFlipStartingCoin(state) || spinning}
        onClick={() => {
          startFlip();
          dispatch({ type: 'FLIP_STARTING_COIN' });
        }}
      >
        Pénzfeldobás
      </Button>
    </>
  );
}

/** AWAITING_START_CHOICE — round 1 only: either a coin flip (2026-08-04 clarification: token-coin-castle/torch, matches the real game's "coin toss" convention) or, if exactly one player's faction is Scoia'tael, that player's explicit pick. From round 2 onward this phase is never re-entered for the Scoia'tael reason (real-rule correction, 2026-08-04) — the previous round's loser simply starts, same as every other faction. */
export function StartingChoiceScreen({ state, dispatch, myPlayer }: StartingChoiceScreenProps) {
  const decisivePlayerId = scoiaTaelDecisivePlayerId(state);

  if (decisivePlayerId) {
    const chooser = state.players.find((p) => p.id === decisivePlayerId)!;
    if (myPlayer && myPlayer !== decisivePlayerId) {
      return (
        <div className={styles.startingChoiceScreen}>
          <div className={styles.screenPanel}>
            <h2>Várakozás</h2>
            <p>{chooser.name} (Scoia'tael) dönti el, ki kezdjen…</p>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.startingChoiceScreen}>
        <div className={styles.screenPanel}>
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
      </div>
    );
  }

  return (
    <div className={styles.startingChoiceScreen}>
      <div className={styles.screenPanel}>
        <h2>Pénzfeldobás dönti el, ki kezd</h2>
        <CoinFlipPanel state={state} dispatch={dispatch} />
      </div>
    </div>
  );
}
