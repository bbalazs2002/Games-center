import { useState } from 'react';
import { FeedbackModal } from './FeedbackModal';
import styles from './FeedbackButton.module.css';

/**
 * Rendered ONCE by RootLayout, above every route — a real, always-reachable
 * "report a bug / send a suggestion" entry point, from the menu OR mid-game
 * alike (the game-specific context, if any, comes from FeedbackContext, not
 * from this component knowing anything about a specific game). See
 * docs/shell-ux-specifikacio.md §4.1.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className={styles.button} onClick={() => setOpen(true)} aria-label="Hiba bejelentése / javaslat küldése">
        💬
      </button>
      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
