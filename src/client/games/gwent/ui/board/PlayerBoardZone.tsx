import { useState } from 'react';
import { computeSideTotal } from '../../../../../shared/games/gwent/engine/rules';
import type { GwentAction } from '../../../../../shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import type { CardDef, Row } from '../../../../../shared/games/gwent/engine/types';
import { CardDetailModal } from '../CardDetailModal';
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
  /** Rows this zone's owner may click right now to finalize a pending row-choice play (Gwent-0c.1 §D) — only ever set for the ACTING player's own zone. */
  selectableRows?: ReadonlySet<Row>;
  onSelectRow?: (row: Row) => void;
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
  selectableRows,
  onSelectRow,
}: PlayerBoardZoneProps) {
  const player = state.players.find((p) => p.id === playerId)!;
  const total = computeSideTotal(state, playerId);
  const rowOrder = outer ? [...INNER_TO_OUTER_ROWS].reverse() : INNER_TO_OUTER_ROWS;
  // Read-only zoom for board/discard cards (Gwent-0c.1 §C, 9./13. pont) — kept
  // local to each zone rather than lifted to MatchBoard, since it never
  // interacts with the play-flow state machine (unlike selectableRows above).
  const [zoomedCard, setZoomedCard] = useState<CardDef | null>(null);

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
            rowSelectable={selectableRows?.has(row) ?? false}
            onSelectRow={() => onSelectRow?.(row)}
            onZoomCard={setZoomedCard}
          />
        ))}
      </div>

      <div className={styles.boardZonePileColumn}>
        {outer ? (
          <>
            <DiscardPile cards={player.discard} zoneKey={`discard:${playerId}`} onZoomCard={setZoomedCard} />
            <DeckPile count={player.deck.length} faction={player.faction} zoneKey={`deck:${playerId}`} />
          </>
        ) : (
          <>
            <DeckPile count={player.deck.length} faction={player.faction} zoneKey={`deck:${playerId}`} />
            <DiscardPile cards={player.discard} zoneKey={`discard:${playerId}`} onZoomCard={setZoomedCard} />
          </>
        )}
      </div>

      <CardDetailModal card={zoomedCard} onClose={() => setZoomedCard(null)} />
    </div>
  );
}
