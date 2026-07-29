import { useGameTheme } from '../shell/useGameTheme';
import styles from './LoadingScreen.module.css';

export interface LoadingScreenProps {
  /** Which game's visual language to load into — omit for a neutral, game-independent loading moment (see docs/shell-ux-specifikacio.md §6). */
  gameId?: string;
}

/**
 * Replaces the old `<p>Betöltés…</p>` Suspense fallback (routes.tsx/GameLoader.tsx)
 * — fills the viewport in the loading game's own theme, with a centered,
 * pulsing label instead of plain black text.
 */
export function LoadingScreen({ gameId }: LoadingScreenProps) {
  const themeClass = useGameTheme(gameId);

  return (
    <div className={[styles.screen, themeClass].filter(Boolean).join(' ')}>
      <span className={styles.label}>BETÖLTÉS…</span>
    </div>
  );
}
