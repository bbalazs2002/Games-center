import { useState, type CSSProperties } from 'react';
import { Modal } from './Modal';
import styles from './ZoomableThumb.module.css';

export interface ZoomableThumbProps {
  src: string;
  alt: string;
  /** Applied to the outer `<button>` — positioning/sizing (e.g. an absolute-positioned thumb inside a larger panel). */
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
  /** Applied to the thumbnail `<img>` itself — visual styling (object-fit, border-radius, box-shadow). */
  imageClassName?: string;
  /** Passed straight through to the zoomed-view `Modal`'s own `className` — each game's own `*ModalTheme.module.css`, so the enlarged view picks up the right `--shell-*` tokens (the `Modal` portals to `document.body`, outside any page-level theme). */
  modalClassName?: string;
}

/**
 * A small clickable thumbnail that opens a bigger version of the same image
 * in a `Modal` — the shape Ramses's `RamsesActiveCardDisplay`
 * (`RamsesGamePage.tsx`) already used for its drawn-card preview, pulled out
 * here as the SECOND consumer (Gazdálkodj okosan's `OwnershipPanel`) needed
 * the identical pattern. Not migrating Ramses's own already-working call
 * site to this in the same round — no functional need, avoids unrelated risk.
 */
export function ZoomableThumb({ src, alt, wrapperClassName, wrapperStyle, imageClassName, modalClassName }: ZoomableThumbProps) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <button type="button" className={[styles.thumbButton, wrapperClassName].filter(Boolean).join(' ')} style={wrapperStyle} onClick={() => setZoomed(true)}>
        <img src={src} alt={alt} className={[styles.thumbImage, imageClassName].filter(Boolean).join(' ')} />
      </button>
      <Modal open={zoomed} onClose={() => setZoomed(false)} className={modalClassName}>
        <img src={src} alt={alt} className={styles.zoomedImage} />
      </Modal>
    </>
  );
}
