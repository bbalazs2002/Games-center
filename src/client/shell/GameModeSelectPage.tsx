import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../ui-kit/Button';
import { MenuNav } from '../ui-kit/MenuNav';
import { RulesModal } from '../ui-kit/RulesModal';
import { GameBackgroundVideo } from './GameBackgroundVideo';
import { GAMES_REGISTRY } from './gamesRegistry';
import { useGameTheme } from './useGameTheme';
import styles from './GameModeSelectPage.module.css';

export function GameModeSelectPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const game = GAMES_REGISTRY.find((entry) => entry.id === gameId);
  const themeClass = useGameTheme(gameId);
  const [rulesOpen, setRulesOpen] = useState(false);

  if (!game) {
    return <p>Ismeretlen játék: {gameId}</p>;
  }

  return (
    <div className={[styles.page, themeClass].filter(Boolean).join(' ')}>
      <GameBackgroundVideo gameId={gameId} />
      <MenuNav backTo="/" />
      <div className={styles.content}>
        <h1>{game.label}</h1>
        <div className={styles.modes}>
          <Button onClick={() => navigate(`/games/${game.id}/local`)}>Lokális játék</Button>
          {game.online && (
            <Button variant="secondary" onClick={() => navigate(`/games/${game.id}/lobby`)}>
              Multiplayer
            </Button>
          )}
          <Button variant="secondary" onClick={() => setRulesOpen(true)}>
            Játékszabály
          </Button>
        </div>
      </div>
      <RulesModal gameId={game.id} open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
