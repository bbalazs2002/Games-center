import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { LoginPage } from './auth/LoginPage';
import { RequireAuth } from './auth/RequireAuth';
import { GameLoader } from './GameLoader';
import { GameModeSelectPage } from './GameModeSelectPage';
import { HomePage } from './HomePage';
import { LobbyPage } from './lobby/LobbyPage';

// lazy(), not a static import — otherwise Rollup would fold the Dáma engine/UI
// into the main bundle, losing GameLoader's dynamic code-splitting benefit
// (see docs/fazis-0a-dama-specifikacio.md, "moduláris letöltéskezelés").
const DamaOnlineGamePage = lazy(() => import('../games/dama/ui/DamaOnlineGamePage'));

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/games/:gameId', element: <GameModeSelectPage /> },
  { path: '/games/:gameId/local', element: <GameLoader /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/games/:gameId/lobby',
    element: (
      <RequireAuth>
        <LobbyPage />
      </RequireAuth>
    ),
  },
  {
    path: '/games/dama/online/:roomId',
    element: (
      <RequireAuth>
        <Suspense fallback={<p>Betöltés…</p>}>
          <DamaOnlineGamePage />
        </Suspense>
      </RequireAuth>
    ),
  },
]);
