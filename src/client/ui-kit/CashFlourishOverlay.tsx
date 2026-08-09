import type { CashFlourish } from '../core/useCashFlourishes';
import styles from './CashFlourishOverlay.module.css';

export interface CashFlourishOverlayProps {
  flourishes: CashFlourish[];
}

/**
 * Purely presentational — renders an already-computed `flourishes` list (not
 * raw log/playerId; see `useCashFlourishes`). The caller mounts this inside
 * a `position: relative` container next to a cash readout (e.g. Hotel's own
 * `.cashChip`) so the `position: absolute` stack anchors correctly.
 */
export function CashFlourishOverlay({ flourishes }: CashFlourishOverlayProps) {
  if (flourishes.length === 0) return null;
  return (
    <div className={styles.stack}>
      {flourishes.map((flourish) => (
        <span key={flourish.id} className={[styles.flourish, flourish.amount >= 0 ? styles.gain : styles.loss].join(' ')}>
          <span className={styles.label}>{flourish.label}</span>
          <span className={styles.amount}>
            {flourish.amount >= 0 ? '+' : '−'}
            {Math.abs(flourish.amount).toLocaleString('hu-HU')}
          </span>
        </span>
      ))}
    </div>
  );
}
