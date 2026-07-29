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
        <button className={styles.closeButton} onClick={onClose} aria-label="Bezárás">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
