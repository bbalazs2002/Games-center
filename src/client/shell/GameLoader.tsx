import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { LoadingScreen } from '../ui-kit/LoadingScreen';
import { ErrorPage } from './ErrorPage';
import { GAMES_REGISTRY } from './gamesRegistry';

const LAZY_GAMES = Object.fromEntries(GAMES_REGISTRY.map((game) => [game.id, lazy(game.load)]));

export function GameLoader() {
  const { gameId } = useParams<{ gameId: string }>();
  const Component = gameId ? LAZY_GAMES[gameId] : undefined;

  if (!Component) {
    return <ErrorPage title="Ismeretlen játék" message={`Nem található "${gameId}" nevű játék.`} />;
  }

  return (
    <Suspense fallback={<LoadingScreen gameId={gameId} />}>
      <Component />
    </Suspense>
  );
}
