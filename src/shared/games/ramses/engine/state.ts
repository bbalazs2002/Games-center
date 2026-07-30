export type PlayerId = string;

/**
 * One of the 48 board positions. `treasureId` is the FIXED "treasure layer"
 * underneath the pyramids — set once at setup and never changed again for
 * the rest of the game (see docs/ramses-0a-specifikacio.md §2.2). `hasPyramid`
 * is the only thing that ever moves. Homokvihar (Sandstorm) doesn't rewrite
 * this — it flips `RamsesState.treasureLayerRotated` instead, see there.
 */
export interface RamsesCell {
  id: string;
  row: number;
  col: number;
  /** null = nothing at this position (36 of the 48 cells) — fixed for the whole game. */
  treasureId: string | null;
  hasPyramid: boolean;
}

export interface TreasureCard {
  kind: 'treasure';
  id: string;
  treasureId: string;
  points: number;
}

export type SpecialCardType = 'SANDSTORM' | 'GIFT' | 'RISK' | 'FATA_MORGANA' | 'POKER' | 'FINISH';

export interface SpecialCard {
  kind: 'special';
  id: string;
  specialType: SpecialCardType;
}

/** What can come off the top of the draw pile — see docs/ramses-0a-specifikacio.md §8.2. */
export type DrawnCard = TreasureCard | SpecialCard;

export interface Player {
  id: PlayerId;
  name: string;
  wonCards: TreasureCard[];
  /** Gave up their own turn early (see rules.ts's canForfeit/reducer.ts's applyForfeit) — skipped for all future turns, ineligible to win, but keeps whatever cards they'd already won. Mirrors Hotel's own Player.bankrupt. */
  forfeited: boolean;
}

export type RamsesStatus = 'IN_PROGRESS' | 'FINISHED';

/**
 * `SEARCHING` is the normal state (SLIDE_PYRAMID targets `activeCard`) — the
 * other phases are each a specific special card's own multi-step resolution.
 * See docs/ramses-0a-specifikacio.md §8.2 for the full per-card flow.
 */
export type RamsesTurnPhase =
  | 'SEARCHING'
  | 'AWAITING_GIFT_TARGET'
  | 'AWAITING_GIFT_SLIDE'
  | 'AWAITING_RISK_NAMING'
  | 'AWAITING_RISK_SLIDE'
  | 'AWAITING_POKER_NAMING'
  | 'AWAITING_POKER_SLIDE'
  | 'AWAITING_FATA_MORGANA_SLIDE';

export type PendingSpecialEffect =
  | { type: 'GIFT'; drawerId: PlayerId; holderId: PlayerId; targetTreasureId: string | null }
  | { type: 'RISK'; drawerId: PlayerId; treasureIds: [string, string]; firstFound: boolean }
  | { type: 'POKER'; drawerId: PlayerId; searcherId: PlayerId; treasureId: string | null }
  // `card` (not just its treasureId) — already pulled out of neighborId's
  // wonCards at borrow time, so the FULL card (including its points) has to
  // live somewhere until the search resolves, one way or the other.
  | { type: 'FATA_MORGANA'; drawerId: PlayerId; neighborId: PlayerId; card: TreasureCard };

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
  /** Face-down, remaining — the top is drawn into `activeCard` (if a TreasureCard) or resolved immediately (if a SpecialCard). */
  drawPile: DrawnCard[];
  /**
   * The treasure currently being searched for in the NORMAL turn flow.
   * During a special card's own resolution (turnPhase !== 'SEARCHING'), the
   * actual search target lives in `pendingSpecialEffect` instead — this
   * stays whatever it was (usually null) until control returns to SEARCHING.
   */
  activeCard: TreasureCard | null;
  turnPhase: RamsesTurnPhase;
  pendingSpecialEffect: PendingSpecialEffect | null;
  /**
   * Homokvihar (Sandstorm) toggles this — the kincs-réteg (treasure layer)
   * rotates 180°, affecting EVERY cell including already-revealed ones (see
   * docs/ramses-0a-specifikacio.md §2.5/§8.2). The 6x8 grid is symmetric
   * under a 180° rotation (r,c -> BOARD_ROWS-1-r, BOARD_COLS-1-c always maps
   * onto another real cell), so a single boolean flag is enough — every
   * treasureId READ (rendering, activeCard/pendingSpecialEffect target
   * comparisons) must go through rules.ts's `effectiveTreasureId` helper
   * instead of reading `RamsesCell.treasureId` directly.
   */
  treasureLayerRotated: boolean;
  players: Player[];
  currentPlayerIndex: number;
  status: RamsesStatus;
  /** Only meaningful once FINISHED — more than one id means a genuine tie (see rules.ts's computeWinnerIds). */
  winnerIds: PlayerId[];
  /** Append-only event history — see RamsesLogEntry. */
  log: RamsesLogEntry[];
}
