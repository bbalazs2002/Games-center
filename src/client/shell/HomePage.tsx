import { useNavigate } from 'react-router-dom';
import { GAMES_REGISTRY } from './gamesRegistry';
import styles from './HomePage.module.css';

/** First letter of the game's own label — used as a placeholder tile face until a real box-cover photo is added (see docs/shell-ux-specifikacio.md §5.2/§8). */
function monogramFor(label: string): string {
  return label.charAt(0).toUpperCase();
}

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Games Center</h1>
      <div className={styles.grid}>
        {GAMES_REGISTRY.map((game) => (
          <button key={game.id} className={styles.tile} onClick={() => navigate(`/games/${game.id}`)}>
            <span className={styles.cover}>
              {game.coverImage ? (
                <img src={game.coverImage} alt="" className={styles.coverImage} />
              ) : (
                <span className={styles.monogram}>{monogramFor(game.label)}</span>
              )}
            </span>
            <span className={styles.label}>{game.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
