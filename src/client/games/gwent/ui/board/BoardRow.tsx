import { assetUrl } from '../../../../core/assetUrl';
import { computeCardPower, computeRowTotal } from '../../../../../shared/games/gwent/engine/rules';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import type { CardInstance, GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import type { Row } from '../../../../../shared/games/gwent/engine/types';
import { TrackedCardTile } from './cardFlight';
import styles from './matchBoard.module.css';

const ROW_LABELS: Record<Row, string> = { Melee: 'Közelharc', Ranged: 'Távolsági', Siege: 'Ostrom' };
const HORN_ICON_PATH = assetUrl('/assets/gwent/icons/horn.png');

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
  /** Opens the full-size detail view for a board card (Gwent-0c.2 §P, 18. pont: direct click, no magnifier) — loses priority to Decoy target-picking whenever that's active on this row. */
  onCardClick?: (instance: CardInstance) => void;
}

export function BoardRow({ state, playerId, row, decoyTargetSelectable, onSelectTarget, rowSelectable, onSelectRow, onCardClick }: BoardRowProps) {
  const rowState = state.players.find((p) => p.id === playerId)!.board[row];
  const total = computeRowTotal(state, playerId, row);
  // Horn now has its own dedicated column (below) — no longer duplicated as a flag icon here (Gwent-0c.2 §R).
  const flags = [rowState.dandelionActive && '🌼', state.activeWeatherRows.includes(row) && '❄️'].filter(Boolean).join(' ');
  // Gwent-0c.2 §R, kiegészítő kérés: azonos nevű lapok mindig egymás mellett — a meglévő
  // cardFlight FLIP-mechanizmus automatikusan animálja az emiatti pozícióváltást is.
  const sortedCards = [...rowState.cards].sort((a, b) => getCardDef(a.defId).name.localeCompare(getCardDef(b.defId).name));

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
      <div className={styles.hornColumn} title={rowState.hornActive ? 'Kürt aktív ezen a soron' : undefined}>
        {rowState.hornActive && <img className={styles.hornIcon} src={HORN_ICON_PATH} alt="Kürt aktív" />}
      </div>
      <div className={styles.rowCards}>
        {sortedCards.map((instance) => (
          <TrackedCardTile
            key={instance.instanceId}
            instance={instance}
            ownerId={playerId}
            power={computeCardPower(state, playerId, row, instance)}
            selected={false}
            targetable={decoyTargetSelectable}
            onClick={
              decoyTargetSelectable ? () => onSelectTarget?.(instance.instanceId) : onCardClick ? () => onCardClick(instance) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
