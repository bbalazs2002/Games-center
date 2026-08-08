import { computeSideTotal, getCurrentPlayer } from '@shared/games/gwent/engine/rules';
import type { GwentAction } from '@shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '@shared/games/gwent/engine/state';
import type { Row } from '@shared/games/gwent/engine/types';
import { BoardRow } from './BoardRow';
import { DeckPile } from './DeckPile';
import { DiscardPile } from './DiscardPile';
import { LeaderAbilityPanel } from './LeaderAbilityPanel';
import { PlayerInfoPanel } from './PlayerInfoPanel';
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
  /** Opens the shared carousel inspector for a card GROUP (Gwent-0d §2/§4) — a board row's own cards, or this zone's whole discard pile. Lifted to MatchBoard so there's exactly one carousel instance for the whole match. */
  onOpenCardGroup: (cards: CardInstance[], initialIndex: number) => void;
  /**
   * False while a hand card is selected and awaiting further input (row/medic
   * pick) — real playtest report, 2026-08-08: already-placed board cards
   * stayed clickable (opening the inspector) mid-decision, easy to misclick.
   * Only gates the board ROWS' own cards, not the discard pile (a different,
   * always-safe-to-inspect zone) — defaults to true (every other caller/spot
   * in a match where nothing is pending).
   */
  boardRowsInteractive?: boolean;
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
  onOpenCardGroup,
  boardRowsInteractive = true,
}: PlayerBoardZoneProps) {
  const player = state.players.find((p) => p.id === playerId)!;
  const total = computeSideTotal(state, playerId);
  const rowOrder = outer ? [...INNER_TO_OUTER_ROWS].reverse() : INNER_TO_OUTER_ROWS;

  const opponent = state.players.find((p) => p.id !== playerId)!;
  const opponentTotal = computeSideTotal(state, opponent.id);
  const isActiveTurn = getCurrentPlayer(state).id === playerId;

  return (
    <div className={styles.boardZone}>
      {/*
        Gwent-0d §3, korrekció: a referencia-képeken a játékos-adatok (portré,
        név, frakció, élet, kéz, pontszám) a BAL oszlopban ülnek, a vezér
        MELLETT — nem egy vízszintes fejléc a sorok fölött (ami eddig itt
        volt). A közép oszlop mostantól TISZTÁN a 3 sor, fejléc nélkül.
        A portré mindig a zóna KÜLSŐ szélén ül (a referencia szerint), a
        vezér mindig a középvonal felé — ez `outer`-nél megfordítja a sorrendet,
        ugyanaz a tükrözési logika, mint a soroknál (`rowOrder`).
      */}
      <div className={styles.boardZoneLeaderColumn}>
        {outer && <PlayerInfoPanel player={player} isSelf={!outer} total={total} leading={total > opponentTotal} isActiveTurn={isActiveTurn} />}
        <LeaderAbilityPanel state={state} playerId={playerId} dispatch={dispatch} viewerId={viewerId} requestDeckReveal={requestDeckReveal} />
        {!outer && <PlayerInfoPanel player={player} isSelf={!outer} total={total} leading={total > opponentTotal} isActiveTurn={isActiveTurn} />}
      </div>

      <div className={styles.boardZoneCenterColumn}>
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
            onOpenGroup={boardRowsInteractive ? onOpenCardGroup : undefined}
          />
        ))}
      </div>

      <div className={outer ? styles.boardZonePileColumn : `${styles.boardZonePileColumn} ${styles.pileColumnBottomGap}`}>
        {outer ? (
          <>
            <DiscardPile cards={player.discard} zoneKey={`discard:${playerId}`} onOpenAll={() => onOpenCardGroup(player.discard, player.discard.length - 1)} />
            <DeckPile count={player.deck.length} faction={player.faction} zoneKey={`deck:${playerId}`} />
          </>
        ) : (
          <>
            <DeckPile count={player.deck.length} faction={player.faction} zoneKey={`deck:${playerId}`} />
            <DiscardPile cards={player.discard} zoneKey={`discard:${playerId}`} onOpenAll={() => onOpenCardGroup(player.discard, player.discard.length - 1)} />
          </>
        )}
      </div>
    </div>
  );
}
