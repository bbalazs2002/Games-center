import { createBrowserRouter } from 'react-router-dom';
import { GameLoader } from './GameLoader';
import { HomePage } from './HomePage';

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/games/:gameId', element: <GameLoader /> },
]);
