import type { ReactNode } from 'react';
import { useGameTheme } from '../shell/useGameTheme';
import styles from './OnlineStatusScreen.module.css';

export interface OnlineStatusScreenProps {
  /** Drives the same game theme LobbyPage uses, so these screens (rendered before the actual game board mounts) aren't the only unthemed step in an otherwise-themed online flow. */
  gameId: string;
  children: ReactNode;
}

/**
 * Themed card wrapper for every connection-lifecycle screen an online game
 * page can show before the real board mounts — connecting, waiting for other
 * players, awaiting the room owner's approval, a rejected request, or a hard
 * error. Previously plain unstyled `<div>`/`<p>` markup, one real playtest
 * report (2026-07-30): "Várakozás a többi játékosra oldalon nincs stílus."
 */
export function OnlineStatusScreen({ gameId, children }: OnlineStatusScreenProps) {
  const themeClass = useGameTheme(gameId);
  return (
    <div className={[styles.page, themeClass].filter(Boolean).join(' ')}>
      <div className={styles.card}>{children}</div>
    </div>
  );
}
