import { computeCardPower, computeRowTotal } from '../../../../../shared/games/gwent/engine/rules';
import type { CardDef } from '../../../../../shared/games/gwent/engine/types';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import type { GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import type { Row } from '../../../../../shared/games/gwent/engine/types';
import { TrackedCardTile } from './cardFlight';
import styles from './matchBoard.module.css';

const ROW_LABELS: Record<Row, string> = { Melee: 'Közelharc', Ranged: 'Távolsági', Siege: 'Ostrom' };

export interface BoardRowProps {
  state: GwentState;
  playerId: PlayerId;
  row: Row;
  /** Selectable board cards for the currently pending Decoy target-pick — clicking calls onSelectTarget. */
  decoyTargetSelectable?: boolean;
  onSelectTarget?: (instanceId: string) => void;
  /** True while this exact row is a legal destination for a pending row-choice play (Gwent-0c.1 §D) — highlights the whole row and makes it clickable, replacing the old Melee/Ranged/Siege button list. */
  rowSelectable?: boolean;
  onSelectRow?: () => void;
  /** Opens the read-only full-size view for a board card (Gwent-0c.1 §C, 9. pont) — both players' board cards are always zoomable, unlike decoy-target-picking which is a one-sided action. */
  onZoomCard?: (def: CardDef) => void;
}

export function BoardRow({ state, playerId, row, decoyTargetSelectable, onSelectTarget, rowSelectable, onSelectRow, onZoomCard }: BoardRowProps) {
  const rowState = state.players.find((p) => p.id === playerId)!.board[row];
  const total = computeRowTotal(state, playerId, row);
  const flags = [rowState.hornActive && '📯', rowState.dandelionActive && '🌼', state.activeWeatherRows.includes(row) && '❄️']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={[styles.boardRow, rowSelectable && styles.boardRowSelectable].filter(Boolean).join(' ')}
      onClick={rowSelectable ? onSelectRow : undefined}
    >
      <div className={styles.rowLabel}>
        <span>{ROW_LABELS[row]}</span>
        <span className={styles.rowTotal}>{total}</span>
        {flags && <span className={styles.rowFlags}>{flags}</span>}
      </div>
      <div className={styles.rowCards}>
        {rowState.cards.map((instance) => (
          <TrackedCardTile
            key={instance.instanceId}
            instance={instance}
            ownerId={playerId}
            power={computeCardPower(state, playerId, row, instance)}
            selected={false}
            targetable={decoyTargetSelectable}
            onClick={decoyTargetSelectable ? () => onSelectTarget?.(instance.instanceId) : undefined}
            onZoom={onZoomCard ? () => onZoomCard(getCardDef(instance.defId)) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
