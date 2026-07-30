import { describe, expect, it } from 'vitest';
import {
  canNameGiftTarget,
  canNamePokerChallenge,
  canNameRiskTreasures,
  canSlidePyramid,
  computeWinnerIds,
  effectiveTreasureId,
  getAdjacentCellIds,
  getHiddenTreasureIds,
  isTreasureRevealed,
  nextPlayerIndex,
  renamePlayer,
  scoreOf,
  toPublicRamsesState,
} from './rules';
import { buildTestState, treasureCard, updateCell } from './testHelpers';
import { TREASURE_CONFIGS } from './treasureConfigs';

describe('getAdjacentCellIds', () => {
  it('returns only up/down/left/right, no diagonals, clipped at the board edge', () => {
    const state = buildTestState();
    expect(getAdjacentCellIds(state.board, 'r0c0')).toEqual(['r1c0', 'r0c1']);
  });

  it('returns all four neighbors for an interior cell', () => {
    const state = buildTestState();
    expect(getAdjacentCellIds(state.board, 'r2c3')).toEqual(['r1c3', 'r3c3', 'r2c2', 'r2c4']);
  });
});

describe('canSlidePyramid', () => {
  it('allows a pyramid adjacent to the empty cell', () => {
    const state = buildTestState(); // empty at r0c0, r0c1 has a pyramid by default
    expect(canSlidePyramid(state, 'r0c1')).toBe(true);
  });

  it('refuses a non-adjacent pyramid', () => {
    const state = buildTestState();
    expect(canSlidePyramid(state, 'r5c7')).toBe(false);
  });

  it('refuses the empty cell itself (nothing to slide)', () => {
    const state = buildTestState();
    expect(canSlidePyramid(state, 'r0c0')).toBe(false);
  });

  it('refuses once the game has finished', () => {
    const state = buildTestState({ status: 'FINISHED' });
    expect(canSlidePyramid(state, 'r0c1')).toBe(false);
  });

  it('refuses during a naming phase (Ajándék/Kockázat/Sivatagi póker) — a NAME_* action is needed first', () => {
    const state = buildTestState({ turnPhase: 'AWAITING_GIFT_TARGET' });
    expect(canSlidePyramid(state, 'r0c1')).toBe(false);
  });

  it('allows sliding during a special card\'s own slide phase', () => {
    const state = buildTestState({ turnPhase: 'AWAITING_FATA_MORGANA_SLIDE' });
    expect(canSlidePyramid(state, 'r0c1')).toBe(true);
  });
});

describe('nextPlayerIndex', () => {
  it('cycles back to 0 after the last player', () => {
    const state = buildTestState({ currentPlayerIndex: 1 }); // 2 players in buildTestState
    expect(nextPlayerIndex(state)).toBe(0);
  });
});

describe('scoreOf / computeWinnerIds', () => {
  it('sums point values across won cards', () => {
    const player = { id: 'p1', name: 'A', wonCards: [treasureCard('c1', 'x', 2), treasureCard('c2', 'y', 3)] };
    expect(scoreOf(player)).toBe(5);
  });

  it('a single clear leader wins outright', () => {
    const players = [
      { id: 'p1', name: 'A', wonCards: [treasureCard('c1', 'x', 4)] },
      { id: 'p2', name: 'B', wonCards: [treasureCard('c2', 'y', 1)] },
    ];
    expect(computeWinnerIds(players)).toEqual(['p1']);
  });

  it('equal points, more cards wins', () => {
    const players = [
      { id: 'p1', name: 'A', wonCards: [treasureCard('c1', 'x', 2), treasureCard('c2', 'y', 2)] },
      { id: 'p2', name: 'B', wonCards: [treasureCard('c3', 'z', 4)] },
    ];
    expect(computeWinnerIds(players)).toEqual(['p1']);
  });

  it('equal points AND equal card count — both co-win', () => {
    const players = [
      { id: 'p1', name: 'A', wonCards: [treasureCard('c1', 'x', 3)] },
      { id: 'p2', name: 'B', wonCards: [treasureCard('c2', 'y', 3)] },
    ];
    expect(computeWinnerIds(players).sort()).toEqual(['p1', 'p2']);
  });
});

describe('renamePlayer', () => {
  it('renames only the matching player, leaves the rest untouched', () => {
    const state = buildTestState();
    const next = renamePlayer(state, 'player-2', 'Real Name');
    expect(next.players).toEqual([
      { id: 'player-1', name: 'Alice', wonCards: [] },
      { id: 'player-2', name: 'Real Name', wonCards: [] },
    ]);
  });
});

describe('toPublicRamsesState', () => {
  it('nulls treasureId only for cells still covered by a pyramid, leaves revealed cells untouched', () => {
    let state = buildTestState();
    state = updateCell(state, 'r1c0', { treasureId: 'ankh', hasPyramid: true }); // still covered — must be masked
    state = updateCell(state, 'r0c0', { treasureId: 'scarab', hasPyramid: false }); // already revealed — must stay visible
    const publicState = toPublicRamsesState(state);
    expect(publicState.board.find((c) => c.id === 'r1c0')?.treasureId).toBeNull();
    expect(publicState.board.find((c) => c.id === 'r0c0')?.treasureId).toBe('scarab');
  });

  /**
   * Real bug, caught 2026-07-30: the empty cell used to keep its own RAW
   * (never-rotating) treasureId when masked, not the rotation-corrected
   * effective one — so once Homokvihar was in play, the client either showed
   * the wrong treasure at the revealed cell or none at all ("a táblán nem
   * mindig jelennek meg a kincsek" playtest report). Also verifies
   * getHiddenTreasureIds/isTreasureRevealed — which the naming wheel and the
   * AI both call on exactly this MASKED state, never the true one — give the
   * right answer downstream once the mask itself is correct.
   */
  it('bakes the ROTATION-CORRECTED (effective) treasureId into the empty cell, not its own raw static value', () => {
    let state = buildTestState({ treasureLayerRotated: true });
    state = updateCell(state, 'r5c7', { treasureId: 'mummy', hasPyramid: true }); // antipodal to r0c0 (the default empty cell)
    const publicState = toPublicRamsesState(state);
    expect(publicState.board.find((c) => c.id === 'r0c0')?.treasureId).toBe('mummy');
    expect(isTreasureRevealed(publicState, 'mummy')).toBe(true);
    expect(getHiddenTreasureIds(publicState)).not.toContain('mummy');
  });

  it('replaces drawPile cards with length-matched placeholders carrying no real treasure info', () => {
    const state = buildTestState({ drawPile: [treasureCard('c1', 'ankh', 3), treasureCard('c2', 'scarab', 1)] });
    const publicState = toPublicRamsesState(state);
    expect(publicState.drawPile).toHaveLength(2);
    expect(publicState.drawPile.every((card) => card.kind === 'treasure' && card.treasureId === '' && card.points === 0)).toBe(true);
  });

  it('leaves everything else (players, activeCard, currentPlayerIndex, status) unchanged', () => {
    const state = buildTestState({ activeCard: treasureCard('c1', 'ankh', 2) });
    const publicState = toPublicRamsesState(state);
    expect(publicState.activeCard).toEqual(state.activeCard);
    expect(publicState.players).toEqual(state.players);
    expect(publicState.currentPlayerIndex).toBe(state.currentPlayerIndex);
    expect(publicState.status).toBe(state.status);
  });
});

describe('effectiveTreasureId', () => {
  it('reads the cell\'s own treasureId when the layer is not rotated', () => {
    const state = updateCell(buildTestState(), 'r2c3', { treasureId: 'mummy' });
    expect(effectiveTreasureId(state, 'r2c3')).toBe('mummy');
  });

  it('reads the 180°-antipodal cell\'s treasureId once rotated (6x8 board: r,c -> 5-r,7-c)', () => {
    let state = buildTestState({ treasureLayerRotated: true });
    state = updateCell(state, 'r5c7', { treasureId: 'mummy' }); // antipodal to r0c0
    expect(effectiveTreasureId(state, 'r0c0')).toBe('mummy');
  });
});

/**
 * At most ONE cell is ever pyramid-free at a time (state.emptyCellId) —
 * confirmed by the user (2026-07-30): sliding a pyramid into the previously-
 * empty cell covers it back up, classic 15-puzzle mechanics. Moves the
 * "empty" spot to `cellId` (undoing buildTestState's default at r0c0 unless
 * `cellId` itself IS r0c0) so every test constructs a genuinely valid state.
 */
function withEmptyAt(cellId: string, treasureId: string | null = null): ReturnType<typeof buildTestState> {
  let state = buildTestState({ emptyCellId: cellId });
  state = updateCell(state, 'r0c0', { hasPyramid: true });
  state = updateCell(state, cellId, { hasPyramid: false, treasureId });
  return state;
}

describe('isTreasureRevealed', () => {
  it('false while the treasure\'s cell still has a pyramid', () => {
    const state = updateCell(buildTestState(), 'r2c3', { treasureId: 'mummy', hasPyramid: true });
    expect(isTreasureRevealed(state, 'mummy')).toBe(false);
  });

  it('true once the treasure\'s cell (the SINGLE empty cell) has no pyramid', () => {
    const state = withEmptyAt('r2c3', 'mummy');
    expect(isTreasureRevealed(state, 'mummy')).toBe(true);
  });

  it('accounts for rotation — revealed via the antipodal cell, not the static one', () => {
    let state = buildTestState({ treasureLayerRotated: true });
    // static treasureId 'mummy' lives at r5c7; its EFFECTIVE display cell (once rotated) is r0c0.
    state = updateCell(state, 'r5c7', { treasureId: 'mummy', hasPyramid: true });
    // r0c0 is already the (only) blank cell by default in buildTestState.
    expect(isTreasureRevealed(state, 'mummy')).toBe(true);
  });
});

describe('getHiddenTreasureIds', () => {
  // Starts from the fixed, real 12-treasure list (TREASURE_CONFIGS) — NOT
  // from scanning the board for non-null treasureId, which would only ever
  // find the synthetic test board's own (few) placed cells and, worse, is
  // simply wrong on a masked state (see this function's own doc comment).
  it('excludes only the ONE treasure currently sitting at the empty cell, if any', () => {
    const state = withEmptyAt('r1c0', 'mummy');
    const hidden = getHiddenTreasureIds(state);
    expect(hidden).not.toContain('mummy');
    expect(new Set(hidden)).toEqual(new Set(TREASURE_CONFIGS.map((t) => t.id).filter((id) => id !== 'mummy')));
  });

  it('excludes nothing when the empty cell is blank (the common case — only 12/48 cells ever have a treasure)', () => {
    const state = buildTestState(); // default empty cell (r0c0) has treasureId: null
    expect(new Set(getHiddenTreasureIds(state))).toEqual(new Set(TREASURE_CONFIGS.map((t) => t.id)));
  });
});

describe('canNameGiftTarget / canNameRiskTreasures / canNamePokerChallenge', () => {
  function withHiddenTreasures(): ReturnType<typeof buildTestState> {
    // 'ankh' sits at the (single) empty cell — "revealed" — everything else
    // (including 'mummy'/'scarab', placed on still-pyramid-covered cells)
    // stays hidden.
    let state = withEmptyAt('r3c0', 'ankh');
    state = updateCell(state, 'r1c0', { treasureId: 'mummy', hasPyramid: true });
    state = updateCell(state, 'r2c0', { treasureId: 'scarab', hasPyramid: true });
    return state;
  }

  it('canNameGiftTarget requires the AWAITING_GIFT_TARGET phase and a still-hidden treasure', () => {
    let state = withHiddenTreasures();
    expect(canNameGiftTarget(state, 'mummy')).toBe(false); // wrong phase
    state = { ...state, turnPhase: 'AWAITING_GIFT_TARGET' };
    expect(canNameGiftTarget(state, 'mummy')).toBe(true);
    expect(canNameGiftTarget(state, 'ankh')).toBe(false); // already revealed
    expect(canNameGiftTarget(state, 'unknown-treasure')).toBe(false);
  });

  it('canNameRiskTreasures requires 2 distinct, still-hidden treasures', () => {
    const state = { ...withHiddenTreasures(), turnPhase: 'AWAITING_RISK_NAMING' as const };
    expect(canNameRiskTreasures(state, ['mummy', 'scarab'])).toBe(true);
    expect(canNameRiskTreasures(state, ['mummy', 'mummy'])).toBe(false);
    expect(canNameRiskTreasures(state, ['mummy', 'ankh'])).toBe(false); // ankh already revealed
  });

  it('canNamePokerChallenge requires a still-hidden treasure and a DIFFERENT player', () => {
    const state = { ...withHiddenTreasures(), turnPhase: 'AWAITING_POKER_NAMING' as const };
    expect(canNamePokerChallenge(state, 'mummy', 'player-2')).toBe(true);
    expect(canNamePokerChallenge(state, 'mummy', 'player-1')).toBe(false); // can't challenge yourself
    expect(canNamePokerChallenge(state, 'mummy', 'unknown-player')).toBe(false);
  });
});
