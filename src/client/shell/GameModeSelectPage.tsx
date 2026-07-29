import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../ui-kit/Button';
import { GAMES_REGISTRY } from './gamesRegistry';
import styles from './GameModeSelectPage.module.css';

export function GameModeSelectPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const game = GAMES_REGISTRY.find((entry) => entry.id === gameId);

  if (!game) {
    return <p>Ismeretlen játék: {gameId}</p>;
  }

  return (
    <div className={styles.page}>
      <h1>{game.label}</h1>
      <div className={styles.modes}>
        <Button onClick={() => navigate(`/games/${game.id}/local`)}>Lokális játék</Button>
        <Button variant="secondary" onClick={() => navigate(`/games/${game.id}/lobby`)}>
          Multiplayer
        </Button>
      </div>
    </div>
  );
}
