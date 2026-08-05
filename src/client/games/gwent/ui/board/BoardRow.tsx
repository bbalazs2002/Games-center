import { assetUrl } from '../../../../core/assetUrl';
import { computeCardPower, computeRowTotal } from '../../../../../shared/games/gwent/engine/rules';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import type { CardInstance, GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import type { Row } from '../../../../../shared/games/gwent/engine/types';
import { METAL_TEXTURE_PATH } from '../gwentTextures';
import { TrackedCardTile } from './cardFlight';
import styles from './matchBoard.module.css';

const ROW_LABELS: Record<Row, string> = { Melee: 'Közelharc', Ranged: 'Távolsági', Siege: 'Ostrom' };
const HORN_ICON_PATH = assetUrl('/assets/gwent/icons/horn.png');
// Gwent-0d §3: the existing row-type icons already visually match the
// reference client's carved medallions (crossed sword/bow/ballista) — reused
// as-is, no new asset needed.
const ROW_MEDALLION_PATH: Record<Row, string> = {
  Melee: assetUrl('/assets/gwent/icons/melee.png'),
  Ranged: assetUrl('/assets/gwent/icons/ranged.png'),
  Siege: assetUrl('/assets/gwent/icons/siege.png'),
};

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
  /** Opens the carousel inspector scoped to THIS row's cards only (Gwent-0d §4. pont: a row is its own group, never mixed with the rest of the board) — loses priority to Decoy target-picking whenever that's active on this row. */
  onOpenGroup?: (cards: CardInstance[], initialIndex: number) => void;
}

export function BoardRow({ state, playerId, row, decoyTargetSelectable, onSelectTarget, rowSelectable, onSelectRow, onOpenGroup }: BoardRowProps) {
  const rowState = state.players.find((p) => p.id === playerId)!.board[row];
  const total = computeRowTotal(state, playerId, row);
  // Horn now has its own dedicated column (below) — no longer duplicated as a flag icon here (Gwent-0c.2 §R).
  // Gwent-0c.4 §J: the Dandelion 🌼 flag removed — the felhasználó found it redundant next to the
  // Dandelion unit card itself already sitting visibly on the board (no separate marker needed).
  const flags = [state.activeWeatherRows.includes(row) && '❄️'].filter(Boolean).join(' ');
  // Gwent-0c.2 §R, kiegészítő kérés: azonos nevű lapok mindig egymás mellett — a meglévő
  // cardFlight FLIP-mechanizmus automatikusan animálja az emiatti pozícióváltást is.
  // Gwent-0c.4 §K: a Kürt-lap(ok) mostantól a `cards`-ban is ott ülnek (nem tűnnek el
  // azonnal a dobott lapok közé) — az ABC-sorrend elé, a `.hornColumn` ikon UTÁN kerülnek,
  // lejátszási sorrendben (több egymást követő Kürt esetén sem cserélődnek fel).
  const hornCards = rowState.cards.filter((c) => getCardDef(c.defId).kind === 'Horn');
  const otherCards = [...rowState.cards.filter((c) => getCardDef(c.defId).kind !== 'Horn')].sort((a, b) =>
    getCardDef(a.defId).name.localeCompare(getCardDef(b.defId).name),
  );
  const sortedCards = [...hornCards, ...otherCards];

  return (
    <div
      className={[styles.boardRow, rowSelectable && styles.boardRowSelectable].filter(Boolean).join(' ')}
      onClick={rowSelectable ? onSelectRow : undefined}
    >
      <div className={styles.rowHinge} style={{ backgroundImage: `url(${METAL_TEXTURE_PATH})` }} />
      <div className={styles.rowLabel}>
        <span className={styles.rowTotal}>{total}</span>
        <img className={styles.rowMedallion} src={ROW_MEDALLION_PATH[row]} alt={ROW_LABELS[row]} title={ROW_LABELS[row]} />
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
            // Horn cards live here now too (Gwent-0c.4 §K) but never show a power badge
            // (basePower: null) — matches CardTile's own documented non-unit convention.
            power={getCardDef(instance.defId).kind === 'Unit' ? computeCardPower(state, playerId, row, instance) : undefined}
            selected={false}
            targetable={decoyTargetSelectable}
            onClick={
              decoyTargetSelectable
                ? () => onSelectTarget?.(instance.instanceId)
                : onOpenGroup
                  ? () => onOpenGroup(sortedCards, sortedCards.findIndex((c) => c.instanceId === instance.instanceId))
                  : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
