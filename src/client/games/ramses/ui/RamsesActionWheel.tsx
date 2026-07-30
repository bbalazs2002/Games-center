import { useEffect, useState } from 'react';
import type { RamsesAction } from '../../../../shared/games/ramses/engine/actions';
import { getHiddenTreasureIds } from '../../../../shared/games/ramses/engine/selectors';
import type { RamsesState } from '../../../../shared/games/ramses/engine/state';
import { WheelMenu } from '../../../ui-kit/WheelMenu';
import { initialLevelFor, levelTitle, slicesFor, type MenuLevel } from './ramsesMenuLevels';
import styles from './RamsesActionWheel.module.css';

export interface RamsesActionWheelProps {
  state: RamsesState;
  dispatch: (action: RamsesAction) => void;
  /** False when it's not the local player's turn (online) or an AI-controlled slot is currently deciding (hot-seat) — mirrors handleCellClick's identical board-click gate in RamsesGamePage.tsx. The wheel stays visible, just every slice renders disabled. */
  interactive?: boolean;
}

/**
 * Radial naming-decision wheel for Ajándék/Kockázat/Sivatagi póker — reuses
 * Hotel's game-agnostic WheelMenu (ui-kit), the same way PlayerActionWheel
 * does, per the user's explicit direction (2026-07-30, see
 * docs/ramses-0a-specifikacio.md §8.4). Only ever rendered while turnPhase is
 * one of the AWAITING_*_NAMING phases — every OTHER phase (including a
 * special card's own slide-chain, Homokvihar, Záró, Fata Morgana's automatic
 * borrow) stays a direct 3D-board click via SLIDE_PYRAMID, unaffected. No
 * "cancel" — naming a target is mandatory once one of these cards is drawn,
 * there's nowhere else for the turn to go.
 */
export function RamsesActionWheel({ state, dispatch, interactive = true }: RamsesActionWheelProps) {
  const [level, setLevel] = useState<MenuLevel | null>(() => initialLevelFor(state.turnPhase));

  // A fresh naming phase (this card, or the NEXT holder in an Ajándék chain)
  // always (re)starts the wheel at its own root level.
  useEffect(() => {
    setLevel(initialLevelFor(state.turnPhase));
  }, [state.turnPhase, state.pendingSpecialEffect]);

  if (!level) return null;

  const hiddenTreasureIds = getHiddenTreasureIds(state);
  const rawSlices = slicesFor(level, state, hiddenTreasureIds, dispatch, setLevel);
  const slices = interactive ? rawSlices : rawSlices.map((slice) => ({ ...slice, disabled: true }));
  const canGoBack = level.kind === 'risk-treasure-2' || level.kind === 'poker-target-player';

  return (
    <div className={styles.container}>
      <div className={styles.title}>{levelTitle(level)}</div>
      <WheelMenu
        slices={slices}
        onBack={canGoBack ? () => setLevel(initialLevelFor(state.turnPhase)) : undefined}
        onClose={() => {}} // no-op — see this component's own doc comment
      />
    </div>
  );
}
