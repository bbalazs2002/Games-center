import { useState } from 'react';
import type { GazdalkodjOkosanState } from '@shared/games/gazdalkodjOkosan/engine/state';
import { formatLogEntry } from './formatLogEntry';
import styles from './GazdalkodjOkosanGameLogPanel.module.css';

export interface GazdalkodjOkosanGameLogPanelProps {
  state: GazdalkodjOkosanState;
}

/** Collapsible full event history — mirrors Hotel's GameLogPanel exactly. Closed by default so it doesn't clutter the board. */
export function GazdalkodjOkosanGameLogPanel({ state }: GazdalkodjOkosanGameLogPanelProps) {
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
          <li key={state.log.length - 1 - indexFromEnd}>{formatLogEntry(entry, state)}</li>
        ))}
      </ul>
    </div>
  );
}
