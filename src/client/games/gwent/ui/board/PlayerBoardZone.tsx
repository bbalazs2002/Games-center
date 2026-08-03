import { computeSideTotal } from '../../../../../shared/games/gwent/engine/rules';
import type { GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import { BoardRow } from './BoardRow';
import styles from './matchBoard.module.css';

export interface PlayerBoardZoneProps {
  state: GwentState;
  playerId: PlayerId;
  decoyTargetSelectable?: boolean;
  onSelectTarget?: (instanceId: string) => void;
}

export function PlayerBoardZone({ state, playerId, decoyTargetSelectable, onSelectTarget }: PlayerBoardZoneProps) {
  const player = state.players.find((p) => p.id === playerId)!;
  const total = computeSideTotal(state, playerId);

  return (
    <div className={styles.boardZone}>
      <div className={styles.boardZoneHeader}>
        <span className={styles.playerName}>{player.name}</span>
        <span className={styles.livesAndRounds}>
          ❤️ {player.lives} · 🏆 {player.roundsWon} · 🃏 {player.hand.length} · Σ {total}
        </span>
      </div>
      <BoardRow state={state} playerId={playerId} row="Siege" decoyTargetSelectable={decoyTargetSelectable} onSelectTarget={onSelectTarget} />
      <BoardRow state={state} playerId={playerId} row="Ranged" decoyTargetSelectable={decoyTargetSelectable} onSelectTarget={onSelectTarget} />
      <BoardRow state={state} playerId={playerId} row="Melee" decoyTargetSelectable={decoyTargetSelectable} onSelectTarget={onSelectTarget} />
    </div>
  );
}
