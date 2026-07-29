import type { ReactNode } from 'react';
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

  return (
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
    </div>
  );
}
