import { Button } from '../../../../ui-kit/Button';
import { canConfirmMulligan, canMulliganSwap, expectedViewerId } from '../../../../../shared/games/gwent/engine/rules';
import type { GwentAction } from '../../../../../shared/games/gwent/engine/actions';
import type { GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import { CardTile } from './CardTile';
import styles from './matchBoard.module.css';

export interface MulliganScreenProps {
  state: GwentState;
  dispatch: (action: GwentAction) => void;
  /** Online mode only — when set and it's the OPPONENT's mulligan turn, their (masked) hand is never rendered as if interactive; a waiting message shows instead. Omitted in local hot-seat mode, where the pass-device gate already guarantees the active player IS the local viewer. */
  myPlayer?: PlayerId;
}

/**
 * Hot-seat hand-off: shows ONE player's mulligan at a time — whichever
 * hasn't confirmed yet, in seat order (`expectedViewerId` in rules.ts — the
 * same helper drives the "pass the device" gate in GwentGamePage, see
 * docs/gwent-0b-multiplayer-specifikacio.md §6). Swapped cards are held in
 * `mulliganSetAside` until CONFIRM_MULLIGAN, so the same card can never be
 * redrawn mid-swap.
 */
export function MulliganScreen({ state, dispatch, myPlayer }: MulliganScreenProps) {
  const activePlayer = state.players.find((p) => p.id === expectedViewerId(state));
  if (!activePlayer) return null;

  if (myPlayer && activePlayer.id !== myPlayer) {
    return (
      <div className={styles.mulliganScreen}>
        <h2>Várakozás</h2>
        <p>{activePlayer.name} most tölti ki a kezdő kezét…</p>
      </div>
    );
  }

  return (
    <div className={styles.mulliganScreen}>
      <h2>{activePlayer.name} — kezdő kéz</h2>
      <p>Legfeljebb 2 lapot cserélhetsz újakra ({activePlayer.mulligansLeft} hátravan). Kattints egy lapra a cseréhez.</p>
      <div className={styles.handArea}>
        {activePlayer.hand.map((instance) => (
          <CardTile
            key={instance.instanceId}
            instance={instance}
            size="medium"
            disabled={!canMulliganSwap(state, activePlayer.id, instance.instanceId)}
            onClick={() => dispatch({ type: 'MULLIGAN_SWAP', playerId: activePlayer.id, instanceId: instance.instanceId })}
          />
        ))}
      </div>
      <Button disabled={!canConfirmMulligan(state, activePlayer.id)} onClick={() => dispatch({ type: 'CONFIRM_MULLIGAN', playerId: activePlayer.id })}>
        Kész
      </Button>
    </div>
  );
}
