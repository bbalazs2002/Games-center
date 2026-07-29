export type PlayerId = string;

/**
 * One of the 48 board positions. `treasureId` is the FIXED "treasure layer"
 * underneath the pyramids — set once at setup and never changed again for
 * the rest of the game (see docs/ramses-0a-specifikacio.md §2.2). `hasPyramid`
 * is the only thing that ever moves.
 */
export interface RamsesCell {
  id: string;
  row: number;
  col: number;
  /** null = nothing at this position (36 of the 48 cells) — fixed for the whole game. */
  treasureId: string | null;
  hasPyramid: boolean;
}

export interface SearchCard {
  id: string;
  treasureId: string;
  points: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  wonCards: SearchCard[];
}

export type RamsesStatus = 'IN_PROGRESS' | 'FINISHED';

/**
 * One applied SLIDE_PYRAMID action's outcome — added purely as context for
 * the shell-level feedback reporter (see docs/shell-ux-specifikacio.md
 * §4.2.1), not for any in-game UI. Covers all three of applySlidePyramid's
 * existing outcomes 1:1: blank (treasureRevealed null), wrong treasure
 * (matched false), correct treasure (matched true).
 */
export interface RamsesLogEntry {
  playerId: PlayerId;
  fromCellId: string;
  toCellId: string;
  treasureRevealed: string | null;
  matched: boolean;
  pointsAwarded: number;
}

export interface RamsesState {
  /** 48 cells, fixed grid positions — see rules.ts's BOARD_ROWS/BOARD_COLS. */
  board: RamsesCell[];
  /** Which cell currently has no pyramid — tracked explicitly rather than re-derived, since exactly one cell is empty at all times. */
  emptyCellId: string;
  /** Face-down, remaining — the top is drawn into `activeCard`. */
  drawPile: SearchCard[];
  /**
   * The treasure currently being searched for. Always set while
   * `status === 'IN_PROGRESS'` (see rules.ts's drawCardForCurrentPlayer /
   * awardActiveCardToCurrentPlayer, which together maintain this invariant —
   * the only way it becomes null again is together with `status` flipping
   * to FINISHED in the same transition).
   */
  activeCard: SearchCard | null;
  players: Player[];
  currentPlayerIndex: number;
  status: RamsesStatus;
  /** Only meaningful once FINISHED — more than one id means a genuine tie (see rules.ts's computeWinnerIds). */
  winnerIds: PlayerId[];
  /** Append-only event history — see RamsesLogEntry. */
  log: RamsesLogEntry[];
}
