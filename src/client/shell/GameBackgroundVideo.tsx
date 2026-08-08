import { GAMES_REGISTRY } from './gamesRegistry';
import styles from './GameBackgroundVideo.module.css';

export interface GameBackgroundVideoProps {
  gameId: string | undefined;
}

/**
 * Looping ambient background video, opt-in per game via `GameDescriptor.backgroundVideo`
 * — renders nothing for games without one (every game today except Hotel).
 * Deliberately a separate, explicit component rather than folded into
 * `useGameTheme`/`theme`, so it has to be added to each page by hand — this
 * keeps it OUT of HotelGamePage/HotelOnlineGamePage (which also use Hotel's
 * theme, for colors only) without needing an opt-out flag. See
 * docs/shell-ux-specifikacio.md §2 for the sibling `theme` mechanism this
 * follows the same "gameId-driven, shell pages that don't know the game"
 * shape as.
 */
export function GameBackgroundVideo({ gameId }: GameBackgroundVideoProps) {
  const game = GAMES_REGISTRY.find((entry) => entry.id === gameId);
  if (!game?.backgroundVideo) return null;

  return (
    <div className={styles.layer} aria-hidden="true">
      <video className={styles.video} src={game.backgroundVideo} autoPlay muted loop playsInline />
    </div>
  );
}
