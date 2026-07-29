import { lazy, Suspense } from 'react';
import { GAMES_REGISTRY } from '../shell/gamesRegistry';
import { useGameTheme } from '../shell/useGameTheme';
import { Modal } from './Modal';
import styles from './RulesModal.module.css';
import themedModal from './themedModalContent.module.css';

// Module scope, not per-render — lazy() must keep a stable identity across
// re-renders (same reasoning as GameLoader.tsx's own LAZY_GAMES map) or
// React would treat every render as a brand-new lazy component and refetch.
const LAZY_RULES = Object.fromEntries(
  GAMES_REGISTRY.filter((game) => game.rules).map((game) => [game.id, lazy(game.rules!)]),
);

export interface RulesModalProps {
  gameId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Game-agnostic shell around a per-game rules component (see
 * `GameDescriptor.rules` in gamesRegistry.ts) — the modal itself knows
 * nothing about any specific game's rules; it only knows how to look one up
 * by id, lazily, and present it in that game's own visual language (via
 * `useGameTheme`). See docs/shell-ux-specifikacio.md §3.
 */
export function RulesModal({ gameId, open, onClose }: RulesModalProps) {
  const themeClass = useGameTheme(gameId);
  const RulesContent = LAZY_RULES[gameId];

  return (
    <Modal
      open={open}
      onClose={onClose}
      className={[styles.rulesModal, themedModal.themed, themeClass].filter(Boolean).join(' ')}
    >
      {RulesContent ? (
        <Suspense fallback={<p>Betöltés…</p>}>
          <RulesContent />
        </Suspense>
      ) : (
        <p>Ehhez a játékhoz még nincs szabályleírás.</p>
      )}
    </Modal>
  );
}
