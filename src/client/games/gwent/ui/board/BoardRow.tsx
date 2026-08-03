import { computeCardPower, computeRowTotal } from '../../../../../shared/games/gwent/engine/rules';
import type { GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import type { Row } from '../../../../../shared/games/gwent/engine/types';
import { CardTile } from './CardTile';
import styles from './matchBoard.module.css';

const ROW_LABELS: Record<Row, string> = { Melee: 'Közelharc', Ranged: 'Távolsági', Siege: 'Ostrom' };

export interface BoardRowProps {
  state: GwentState;
  playerId: PlayerId;
  row: Row;
  /** Selectable board cards for the currently pending Decoy target-pick — clicking calls onSelectTarget. */
  decoyTargetSelectable?: boolean;
  onSelectTarget?: (instanceId: string) => void;
}

export function BoardRow({ state, playerId, row, decoyTargetSelectable, onSelectTarget }: BoardRowProps) {
  const rowState = state.players.find((p) => p.id === playerId)!.board[row];
  const total = computeRowTotal(state, playerId, row);
  const flags = [rowState.hornActive && '📯', rowState.dandelionActive && '🌼', state.activeWeatherRows.includes(row) && '❄️']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.boardRow}>
      <div className={styles.rowLabel}>
        <span>{ROW_LABELS[row]}</span>
        <span className={styles.rowTotal}>{total}</span>
        {flags && <span className={styles.rowFlags}>{flags}</span>}
      </div>
      <div className={styles.rowCards}>
        {rowState.cards.map((instance) => (
          <CardTile
            key={instance.instanceId}
            instance={instance}
            power={computeCardPower(state, playerId, row, instance)}
            selected={false}
            disabled={!decoyTargetSelectable}
            onClick={decoyTargetSelectable ? () => onSelectTarget?.(instance.instanceId) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
