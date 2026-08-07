import type { ReactElement } from 'react';
import { assetUrl } from '../../../core/assetUrl';
import type { RamsesAction } from '@shared/games/ramses/engine/actions';
import type { PlayerId, RamsesState } from '@shared/games/ramses/engine/state';
import { getTreasureConfig } from '@shared/games/ramses/engine/treasureConfigs';
import type { WheelMenuSlice } from '../../../ui-kit/WheelMenu';
import styles from './RamsesActionWheel.module.css';

/**
 * Navigation levels for the naming-decision wheel — see
 * docs/ramses-0a-specifikacio.md §8.4. Mirrors Hotel's hotelMenuLevels.ts
 * role/naming, just far shallower (at most 2 steps deep, vs. Hotel's
 * multi-level construction drill-down) since Ramses only ever needs this
 * wheel for the 3 naming-based special cards (Ajándék/Kockázat/Sivatagi
 * póker) — everything else is a direct 3D-board click (SLIDE_PYRAMID).
 */
export type MenuLevel =
  | { kind: 'gift-target' }
  | { kind: 'risk-treasure-1' }
  | { kind: 'risk-treasure-2'; firstTreasureId: string }
  | { kind: 'poker-treasure' }
  | { kind: 'poker-target-player'; treasureId: string };

/** The level the wheel should open on for a given turnPhase — null when the wheel has nothing to show (normal SLIDE_PYRAMID phases). */
export function initialLevelFor(turnPhase: RamsesState['turnPhase']): MenuLevel | null {
  switch (turnPhase) {
    case 'AWAITING_GIFT_TARGET':
      return { kind: 'gift-target' };
    case 'AWAITING_RISK_NAMING':
      return { kind: 'risk-treasure-1' };
    case 'AWAITING_POKER_NAMING':
      return { kind: 'poker-treasure' };
    default:
      return null;
  }
}

export function levelTitle(level: MenuLevel): string {
  switch (level.kind) {
    case 'gift-target':
      return 'Ajándék — melyik kincset keresed?';
    case 'risk-treasure-1':
      return 'Kockázat — nevezz meg egy kincset (1/2)';
    case 'risk-treasure-2':
      return 'Kockázat — nevezz meg egy MÁSIK kincset (2/2)';
    case 'poker-treasure':
      return 'Sivatagi póker — melyik kincset kell megkeresni?';
    case 'poker-target-player':
      return 'Sivatagi póker — ki keresse?';
  }
}

function treasureIcon(treasureId: string): ReactElement {
  const config = getTreasureConfig(treasureId);
  return (
    <span
      className={styles.treasureIcon}
      style={{ backgroundColor: config.color, backgroundImage: config.imagePath ? `url(${assetUrl(config.imagePath)})` : undefined }}
    />
  );
}

function treasureSlices(treasureIds: readonly string[], onSelect: (treasureId: string) => void): WheelMenuSlice[] {
  return treasureIds.map((treasureId) => ({
    id: treasureId,
    label: getTreasureConfig(treasureId).label,
    icon: treasureIcon(treasureId),
    onSelect: () => onSelect(treasureId),
  }));
}

/** Excludes forfeited players too — see rules.ts's canNamePokerChallenge, which rejects naming one anyway (nobody would ever act for a forfeited player's temporarily-borrowed turn). */
function playerSlices(state: RamsesState, excludeId: PlayerId, onSelect: (playerId: PlayerId) => void): WheelMenuSlice[] {
  return state.players
    .filter((player) => player.id !== excludeId && !player.forfeited)
    .map((player) => ({
      id: player.id,
      label: player.name,
      icon: <span className={styles.playerIcon}>{player.name.trim().charAt(0).toUpperCase() || '?'}</span>,
      onSelect: () => onSelect(player.id),
    }));
}

/**
 * Builds this level's slices — `hiddenTreasureIds` is passed in rather than
 * recomputed here so the caller (RamsesActionWheel) can derive it once from
 * `getHiddenTreasureIds(state)` per render.
 */
export function slicesFor(
  level: MenuLevel,
  state: RamsesState,
  hiddenTreasureIds: readonly string[],
  dispatch: (action: RamsesAction) => void,
  push: (level: MenuLevel) => void,
): WheelMenuSlice[] {
  const currentPlayerId = state.players[state.currentPlayerIndex].id;
  switch (level.kind) {
    case 'gift-target':
      return treasureSlices(hiddenTreasureIds, (treasureId) => dispatch({ type: 'NAME_GIFT_TARGET', treasureId }));
    case 'risk-treasure-1':
      return treasureSlices(hiddenTreasureIds, (treasureId) => push({ kind: 'risk-treasure-2', firstTreasureId: treasureId }));
    case 'risk-treasure-2':
      return treasureSlices(
        hiddenTreasureIds.filter((id) => id !== level.firstTreasureId),
        (treasureId) => dispatch({ type: 'NAME_RISK_TREASURES', treasureIds: [level.firstTreasureId, treasureId] }),
      );
    case 'poker-treasure':
      return treasureSlices(hiddenTreasureIds, (treasureId) => push({ kind: 'poker-target-player', treasureId }));
    case 'poker-target-player':
      return playerSlices(state, currentPlayerId, (targetPlayerId) =>
        dispatch({ type: 'NAME_POKER_CHALLENGE', treasureId: level.treasureId, targetPlayerId }),
      );
    default:
      return [];
  }
}
