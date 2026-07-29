import { useNavigate } from 'react-router-dom';
import styles from './MenuNav.module.css';

export interface MenuNavProps {
  /** Explicit path, not browser history (`navigate(-1)`) — deterministic regardless of how the page was actually reached. */
  backTo: string;
}

/**
 * "Vissza" (one level up) + "Főmenü" (home) — top-left, on every menu/setup
 * page (GameModeSelectPage, LobbyPage, the three SetupPages) so a player is
 * never stuck without a way out except the browser's own back button. A
 * real playtest request (2026-07-29). NOT shown on an in-progress game's own
 * page — LocalGameControls (Kilépés/Új játék) serves that role there.
 */
export function MenuNav({ backTo }: MenuNavProps) {
  const navigate = useNavigate();
  return (
    <div className={styles.nav}>
      <button className={styles.button} onClick={() => navigate(backTo)}>
        ← Vissza
      </button>
      <button className={styles.button} onClick={() => navigate('/')}>
        Főmenü
      </button>
    </div>
  );
}
