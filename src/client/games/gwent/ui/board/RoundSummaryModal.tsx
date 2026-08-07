import { Modal } from '../../../../ui-kit/Modal';
import { Button } from '../../../../ui-kit/Button';
import { useGameTheme } from '../../../../shell/useGameTheme';
import { getPlayer } from '@shared/games/gwent/engine/rules';
import type { GwentAction } from '@shared/games/gwent/engine/actions';
import type { GwentState } from '@shared/games/gwent/engine/state';
import styles from './matchBoard.module.css';
import themedModal from '../../../../ui-kit/themedModalContent.module.css';

export interface RoundSummaryModalProps {
  state: GwentState;
  dispatch: (action: GwentAction) => void;
}

/** Shown for the entire ROUND_RESOLVED phase — the round outcome is already computed and logged (see reducer.ts resolveRound), this just surfaces it and gates the explicit CONTINUE_AFTER_ROUND action (never automatic, see state.ts GwentPhase doc comment). */
export function RoundSummaryModal({ state, dispatch }: RoundSummaryModalProps) {
  const themeClass = useGameTheme('gwent');
  const entry = [...state.log].reverse().find((e) => e.type === 'ROUND_RESOLVED');
  if (!entry || entry.type !== 'ROUND_RESOLVED') return null;

  return (
    <Modal open onClose={() => {}} className={[themedModal.themed, themeClass].filter(Boolean).join(' ')}>
      <h2>{entry.round}. kör vége</h2>
      <ul className={styles.roundSummaryList}>
        {state.players.map((p) => (
          <li key={p.id}>
            {p.name}: {entry.totals[p.id]} erő {entry.livesLost.includes(p.id) && '— 1 életet veszít'}
          </li>
        ))}
      </ul>
      <p>
        {entry.tie
          ? 'A kör döntetlen!'
          : entry.winnerId
            ? `${getPlayer(state, entry.winnerId).name} nyerte a kört.`
            : 'A kör döntetlen!'}
      </p>
      <Button onClick={() => dispatch({ type: 'CONTINUE_AFTER_ROUND' })}>Tovább</Button>
    </Modal>
  );
}
