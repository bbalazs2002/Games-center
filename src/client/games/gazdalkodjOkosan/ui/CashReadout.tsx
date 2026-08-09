import { CashFlourishOverlay } from '../../../ui-kit/CashFlourishOverlay';
import { useCashFlourishes } from '../../../core/useCashFlourishes';
import type { LogEntry, PlayerId } from '@shared/games/gazdalkodjOkosan/engine/state';
import { gazdalkodjCashDeltaForPlayer } from './gazdalkodjOkosanCashDelta';
import { gazdalkodjCashNoteUrl } from './gazdalkodjOkosanAssets';
import styles from './CashReadout.module.css';

export interface CashReadoutProps {
  amount: number;
  playerId: PlayerId;
  log: LogEntry[];
}

/** Készpénz readout with a small representative banknote (threshold-based, not literal change-making — mirrors Hotel's cashNoteFor) plus a floating +/- flourish on every cash-affecting log entry (shared with Hotel, see useCashFlourishes.ts). The number is always the real data; the note/flourish are decoration. */
export function CashReadout({ amount, playerId, log }: CashReadoutProps) {
  const flourishes = useCashFlourishes(log, playerId, gazdalkodjCashDeltaForPlayer);
  return (
    <span className={styles.readout}>
      <img src={gazdalkodjCashNoteUrl(amount)} alt="" className={styles.note} />
      {amount.toLocaleString('hu-HU')} EUR
      <CashFlourishOverlay flourishes={flourishes} />
    </span>
  );
}
