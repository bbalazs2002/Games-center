import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { LoadingScreen } from '../ui-kit/LoadingScreen';
import { LoginPage } from './auth/LoginPage';
import { RequireAuth } from './auth/RequireAuth';
import { GameLoader } from './GameLoader';
import { GameModeSelectPage } from './GameModeSelectPage';
import { HomePage } from './HomePage';
import { LobbyPage } from './lobby/LobbyPage';
import { RootLayout } from './RootLayout';

// lazy(), not a static import — otherwise Rollup would fold each game's
// engine/UI into the main bundle, losing GameLoader's dynamic code-splitting
// benefit (see docs/dama-0a-specifikacio.md, "moduláris letöltéskezelés").
const DamaOnlineGamePage = lazy(() => import('../games/dama/ui/DamaOnlineGamePage'));
const HotelOnlineGamePage = lazy(() => import('../games/hotel/ui/HotelOnlineGamePage'));
const RamsesOnlineGamePage = lazy(() => import('../games/ramses/ui/RamsesOnlineGamePage'));
// Debug-only raw .glb inspector — see docs/hotel-0c-specifikacio.md §5.7.
const HotelModelViewerPage = lazy(() => import('../games/hotel/ui/HotelModelViewerPage'));

export const router = createBrowserRouter([
  {
    // No `path` — a pure layout wrapper (RootLayout's <Outlet/>), doesn't add
    // a URL segment. Mounts the feedback button once, above every route
    // below, instead of wiring it into each page individually — see
    // docs/shell-ux-specifikacio.md §4.1.
    element: <RootLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/games/:gameId', element: <GameModeSelectPage /> },
      { path: '/games/:gameId/local', element: <GameLoader /> },
      {
        path: '/games/hotel/model-viewer',
        element: (
          <Suspense fallback={<LoadingScreen gameId="hotel" />}>
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
            <Suspense fallback={<LoadingScreen gameId="dama" />}>
              <DamaOnlineGamePage />
            </Suspense>
          </RequireAuth>
        ),
      },
      {
        path: '/games/hotel/online/:roomId',
        element: (
          <RequireAuth>
            <Suspense fallback={<LoadingScreen gameId="hotel" />}>
              <HotelOnlineGamePage />
            </Suspense>
          </RequireAuth>
        ),
      },
      {
        path: '/games/ramses/online/:roomId',
        element: (
          <RequireAuth>
            <Suspense fallback={<LoadingScreen gameId="ramses" />}>
              <RamsesOnlineGamePage />
            </Suspense>
          </RequireAuth>
        ),
      },
    ],
  },
]);
