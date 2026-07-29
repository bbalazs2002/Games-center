import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { LoginPage } from './auth/LoginPage';
import { RequireAuth } from './auth/RequireAuth';
import { GameLoader } from './GameLoader';
import { GameModeSelectPage } from './GameModeSelectPage';
import { HomePage } from './HomePage';
import { LobbyPage } from './lobby/LobbyPage';

// lazy(), not a static import — otherwise Rollup would fold each game's
// engine/UI into the main bundle, losing GameLoader's dynamic code-splitting
// benefit (see docs/dama-0a-specifikacio.md, "moduláris letöltéskezelés").
const DamaOnlineGamePage = lazy(() => import('../games/dama/ui/DamaOnlineGamePage'));
const HotelOnlineGamePage = lazy(() => import('../games/hotel/ui/HotelOnlineGamePage'));
const RamsesOnlineGamePage = lazy(() => import('../games/ramses/ui/RamsesOnlineGamePage'));
// Debug-only raw .glb inspector — see docs/hotel-0c-specifikacio.md §5.7.
const HotelModelViewerPage = lazy(() => import('../games/hotel/ui/HotelModelViewerPage'));

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/games/:gameId', element: <GameModeSelectPage /> },
  { path: '/games/:gameId/local', element: <GameLoader /> },
  {
    path: '/games/hotel/model-viewer',
    element: (
      <Suspense fallback={<p>Betöltés…</p>}>
        <HotelModelViewerPage />
      </Suspense>
    ),
  },
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
  {
    path: '/games/hotel/online/:roomId',
    element: (
      <RequireAuth>
        <Suspense fallback={<p>Betöltés…</p>}>
          <HotelOnlineGamePage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/games/ramses/online/:roomId',
    element: (
      <RequireAuth>
        <Suspense fallback={<p>Betöltés…</p>}>
          <RamsesOnlineGamePage />
        </Suspense>
      </RequireAuth>
    ),
  },
]);
