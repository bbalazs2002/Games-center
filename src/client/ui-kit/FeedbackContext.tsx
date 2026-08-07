import { useMemo, type ReactNode } from 'react';
import { createFeedbackContextStore, FeedbackContext } from './useFeedbackContext';

export function FeedbackContextProvider({ children }: { children: ReactNode }) {
  const store = useMemo(createFeedbackContextStore, []);
  return <FeedbackContext.Provider value={store}>{children}</FeedbackContext.Provider>;
}
