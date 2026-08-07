import { useState } from 'react';
import { Button } from '../../../../ui-kit/Button';
import { canConfirmMulligan, canMulliganSwap, expectedViewerId } from '@shared/games/gwent/engine/rules';
import type { GwentAction } from '@shared/games/gwent/engine/actions';
import type { GwentState, PlayerId } from '@shared/games/gwent/engine/state';
import { CardCarouselModal, type CarouselEntry } from './CardCarouselModal';
import { CardTile } from './CardTile';
import { useHandFan } from './useHandFan';
import styles from './matchBoard.module.css';

const MIN_VISIBLE_PX = 32;

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
  // Gwent-0d §4: the reference client's redraw screen — click a card to
  // center it in the carousel, its data shown below; "Csere" commits it.
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const { containerRef, overlapPx } = useHandFan(activePlayer?.hand.length ?? 0, MIN_VISIBLE_PX);

  if (!activePlayer) return null;

  if (myPlayer && activePlayer.id !== myPlayer) {
    return (
      <div className={styles.mulliganScreen}>
        <h2>Várakozás</h2>
        <p>{activePlayer.name} most tölti ki a kezdő kezét…</p>
      </div>
    );
  }

  const entries: CarouselEntry[] = activePlayer.hand.map((instance) => ({ type: 'card', instance }));

  return (
    <div className={styles.mulliganScreen}>
      <h2>{activePlayer.name} — kezdő kéz</h2>
      <p>Legfeljebb 2 lapot cserélhetsz újakra ({activePlayer.mulligansLeft} hátravan). Kattints egy lapra a megtekintéshez.</p>
      <div className={styles.handArea} ref={containerRef}>
        {activePlayer.hand.map((instance, index) => (
          <CardTile
            key={instance.instanceId}
            instance={instance}
            size="large"
            disabled={!canMulliganSwap(state, activePlayer.id, instance.instanceId)}
            onClick={() => setPreviewIndex(index)}
            style={index > 0 ? { marginLeft: -overlapPx } : undefined}
          />
        ))}
      </div>
      <Button disabled={!canConfirmMulligan(state, activePlayer.id)} onClick={() => dispatch({ type: 'CONFIRM_MULLIGAN', playerId: activePlayer.id })}>
        Kész
      </Button>

      <CardCarouselModal
        entries={previewIndex !== null ? entries : null}
        initialIndex={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
        confirmLabel="Csere"
        isConfirmDisabled={(entry) => entry.type !== 'card' || !canMulliganSwap(state, activePlayer.id, entry.instance.instanceId)}
        onConfirm={(entry) => {
          if (entry.type !== 'card') return;
          dispatch({ type: 'MULLIGAN_SWAP', playerId: activePlayer.id, instanceId: entry.instance.instanceId });
          setPreviewIndex(null);
        }}
      />
    </div>
  );
}
