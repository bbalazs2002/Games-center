import { computeSideTotal } from '../../../../../shared/games/gwent/engine/rules';
import type { GwentAction } from '../../../../../shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import type { Row } from '../../../../../shared/games/gwent/engine/types';
import { BoardRow } from './BoardRow';
import { DeckPile } from './DeckPile';
import { DiscardPile } from './DiscardPile';
import { LeaderAbilityPanel } from './LeaderAbilityPanel';
import { LifeTokens } from './LifeTokens';
import styles from './matchBoard.module.css';

export interface PlayerBoardZoneProps {
  state: GwentState;
  playerId: PlayerId;
  dispatch: (action: GwentAction) => void;
  /**
   * True for whichever of the two zones is rendered FARTHER from the shared
   * middle divider (i.e. the physically first-rendered/topmost one) —
   * decides row order (Melee always innermost, nearest the divider — see
   * docs/gwent-0c-vizualis-animacio-specifikacio.md §4.5, Gwent-Board-Outlines.pdf)
   * and the Deck/Discard column order (Deck always nearer the rows, Discard
   * always nearer the zone's own outer edge). Independent of WHICH player
   * happens to occupy this slot — see MatchBoard's bottomViewerId rotation.
   */
  outer: boolean;
  /** Gates LeaderAbilityPanel's interactivity — undefined (local, no online myPlayer/no rotation) means "always interactive if legal"; otherwise only this zone's OWN leader panel (playerId === viewerId) may be activated. */
  viewerId?: PlayerId;
  requestDeckReveal: (playerId: PlayerId) => Promise<CardInstance[]>;
  decoyTargetSelectable?: boolean;
  onSelectTarget?: (instanceId: string) => void;
}

const INNER_TO_OUTER_ROWS: Row[] = ['Melee', 'Ranged', 'Siege'];

export function PlayerBoardZone({
  state,
  playerId,
  dispatch,
  outer,
  viewerId,
  requestDeckReveal,
  decoyTargetSelectable,
  onSelectTarget,
}: PlayerBoardZoneProps) {
  const player = state.players.find((p) => p.id === playerId)!;
  const total = computeSideTotal(state, playerId);
  const rowOrder = outer ? [...INNER_TO_OUTER_ROWS].reverse() : INNER_TO_OUTER_ROWS;

  return (
    <div className={styles.boardZone}>
      <div className={styles.boardZoneLeaderColumn}>
        <LeaderAbilityPanel state={state} playerId={playerId} dispatch={dispatch} viewerId={viewerId} requestDeckReveal={requestDeckReveal} />
        <LifeTokens lives={player.lives} />
      </div>

      <div className={styles.boardZoneCenterColumn}>
        <div className={styles.boardZoneHeader}>
          <span className={styles.playerName}>{player.name}</span>
          <span className={styles.livesAndRounds}>
            🏆 {player.roundsWon} · 🃏 {player.hand.length} · Σ {total}
          </span>
        </div>
        {rowOrder.map((row) => (
          <BoardRow
            key={row}
            state={state}
            playerId={playerId}
            row={row}
            decoyTargetSelectable={decoyTargetSelectable}
            onSelectTarget={onSelectTarget}
          />
        ))}
      </div>

      <div className={styles.boardZonePileColumn}>
        {outer ? (
          <>
            <DiscardPile cards={player.discard} zoneKey={`discard:${playerId}`} />
            <DeckPile count={player.deck.length} faction={player.faction} zoneKey={`deck:${playerId}`} />
          </>
        ) : (
          <>
            <DeckPile count={player.deck.length} faction={player.faction} zoneKey={`deck:${playerId}`} />
            <DiscardPile cards={player.discard} zoneKey={`discard:${playerId}`} />
          </>
        )}
      </div>
    </div>
  );
}
