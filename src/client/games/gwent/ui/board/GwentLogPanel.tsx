import { useState } from 'react';
import type { GwentState } from '@shared/games/gwent/engine/state';
import { formatGwentLogEntry } from './formatGwentLogEntry';
import styles from './GwentLogPanel.module.css';

export interface GwentLogPanelProps {
  state: GwentState;
}

/** Collapsible full event history — the Gwent equivalent of Hotel's `GameLogPanel.tsx` (Gwent-0c.1 §F, 16. pont). Closed by default so it doesn't clutter the board; bottom-right corner, the one spot not already claimed by the top-center exit controls or the left-edge feedback button. */
export function GwentLogPanel({ state }: GwentLogPanelProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className={styles.toggleButton} onClick={() => setOpen(true)}>
        Napló ({state.log.length})
      </button>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>Játéknapló</h3>
        <button onClick={() => setOpen(false)} aria-label="Bezárás">
          ×
        </button>
      </div>
      <ul className={styles.entries}>
        {state.log.length === 0 && <li className={styles.empty}>Még nem történt semmi.</li>}
        {[...state.log].reverse().map((entry, indexFromEnd) => (
          <li key={state.log.length - 1 - indexFromEnd}>{formatGwentLogEntry(entry, state)}</li>
        ))}
      </ul>
    </div>
  );
}
