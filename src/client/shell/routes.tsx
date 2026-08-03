import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { LoadingScreen } from '../ui-kit/LoadingScreen';
import { LoginPage } from './auth/LoginPage';
import { RequireAuth } from './auth/RequireAuth';
import { RouteErrorPage } from './ErrorPage';
import { GameLoader } from './GameLoader';
import { GameModeSelectPage } from './GameModeSelectPage';
import { HomePage } from './HomePage';
import { LobbyPage } from './lobby/LobbyPage';
import { RootLayout } from './RootLayout';

// lazy(), not a static import — otherwise Rollup would fold each game's
// engine/UI into the main bundle, losing GameLoader's dynamic code-splitting
// benefit (see docs/dama-0a-specifikacio.md, "moduláris letöltéskezelés").
const DamaOnlineGamePage = lazy(() => import('../games/dama/ui/DamaOnlineGamePage'));
const GwentOnlineGamePage = lazy(() => import('../games/gwent/ui/GwentOnlineGamePage'));
const HotelOnlineGamePage = lazy(() => import('../games/hotel/ui/HotelOnlineGamePage'));
const RamsesOnlineGamePage = lazy(() => import('../games/ramses/ui/RamsesOnlineGamePage'));
// Debug-only raw .glb inspector — see docs/hotel-0c-specifikacio.md §5.7.
const HotelModelViewerPage = lazy(() => import('../games/hotel/ui/HotelModelViewerPage'));

// Vite's BASE_URL always mirrors vite.config.ts's `base` (build-time
// VITE_BASE_PATH, e.g. "/game-center/" in production — see
// docs/deployment-specifikacio.md §8) and always ends in "/", but
// react-router's basename wants no trailing slash — `undefined` for the
// default root deploy keeps local dev/CI's URLs exactly as before.
const BASENAME = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '');

export const router = createBrowserRouter([
  {
    // No `path` — a pure layout wrapper (RootLayout's <Outlet/>), doesn't add
    // a URL segment. Mounts the feedback button once, above every route
    // below, instead of wiring it into each page individually — see
    // docs/shell-ux-specifikacio.md §4.1.
    element: <RootLayout />,
    // Catches both an unmatched URL (React Router synthesizes a 404
    // ErrorResponse when nothing below matches) and any thrown
    // render/loader/action error from any route below — previously neither
    // was handled at all, so both fell through to React Router's own plain
    // default error screen (real playtest report, 2026-08-03).
    errorElement: <RouteErrorPage />,
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
      {
        path: '/games/gwent/online/:roomId',
        element: (
          <RequireAuth>
            <Suspense fallback={<LoadingScreen gameId="gwent" />}>
              <GwentOnlineGamePage />
            </Suspense>
          </RequireAuth>
        ),
      },
    ],
  },
], { basename: BASENAME });
