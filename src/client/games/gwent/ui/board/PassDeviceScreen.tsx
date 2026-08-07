import { Button } from '../../../../ui-kit/Button';
import styles from './matchBoard.module.css';

export interface PassDeviceScreenProps {
  nextPlayerName: string;
  onReveal: () => void;
}

/**
 * Local hot-seat "look away" gate — shown whenever the screen is about to
 * switch to a different player's turn/mulligan, so the outgoing player's
 * hand isn't left visible while the device is handed over. See
 * docs/gwent-0b-multiplayer-specifikacio.md §6 — GwentGamePage renders this
 * INSTEAD OF the actual board/mulligan/starting-choice screen whenever
 * `expectedViewerId(state) !== activeViewerId`.
 */
export function PassDeviceScreen({ nextPlayerName, onReveal }: PassDeviceScreenProps) {
  return (
    <div className={styles.passDeviceScreen}>
      <div className={styles.screenPanel}>
        <h2>Add tovább a gépet</h2>
        <p>Most {nextPlayerName} következik — győződj meg róla, hogy ő nézi a képernyőt.</p>
        <Button onClick={onReveal}>Megvan, mehet</Button>
      </div>
    </div>
  );
}
