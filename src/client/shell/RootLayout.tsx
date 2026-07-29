import { Outlet } from 'react-router-dom';
import { FeedbackButton } from '../ui-kit/FeedbackButton';
import { FeedbackContextProvider } from '../ui-kit/FeedbackContext';

/**
 * Mounted once, above every route (see routes.tsx) — the one place a
 * shell-level, always-present element (the feedback button) can live
 * without being wired into every individual page. See
 * docs/shell-ux-specifikacio.md §4.1.
 */
export function RootLayout() {
  return (
    <FeedbackContextProvider>
      <Outlet />
      <FeedbackButton />
    </FeedbackContextProvider>
  );
}
