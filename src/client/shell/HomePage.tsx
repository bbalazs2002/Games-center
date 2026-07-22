import { useNavigate } from 'react-router-dom';
import { Menu } from '../ui-kit/Menu';
import { GAMES_REGISTRY } from './gamesRegistry';

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div>
      <h1>Games Center</h1>
      <Menu
        items={GAMES_REGISTRY.map((game) => ({
          id: game.id,
          label: game.label,
          onSelect: () => navigate(`/games/${game.id}`),
        }))}
      />
    </div>
  );
}
