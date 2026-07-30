import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Extra class(es) appended to the content box — lets a consuming page restyle background/text (e.g. Hotel's dark glass theme) without touching this component's own defaults, which every other caller still relies on. */
  className?: string;
}

export function Modal({ open, onClose, children, className }: ModalProps) {
  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={[styles.content, className].filter(Boolean).join(' ')}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Sibling of .body, NOT a child of it — .body is the only element
            that scrolls (see Modal.module.css), so the button stays pinned
            to .content's own top-right corner regardless of scroll position.
            A close button that scrolled away with the content (its previous
            behavior, as a positioned child INSIDE the scrolling box) was a
            real playtest complaint (2026-07-29). */}
        <button className={styles.closeButton} onClick={onClose} aria-label="Bezárás">
          ×
        </button>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    // Always portalled straight to <body> — a caller nesting a Modal inside
    // ANY ancestor with backdrop-filter/filter/transform/perspective/contain
    // (e.g. Ramses's HUD panel, which uses backdrop-filter for its glass
    // look) otherwise traps this `position: fixed` overlay inside that
    // ancestor's box instead of covering the viewport — a real CSS
    // containing-block gotcha, caught 2026-07-30 (the "kinagyítható lap" modal
    // rendered squeezed into the HUD corner instead of centered fullscreen).
    document.body,
  );
}
