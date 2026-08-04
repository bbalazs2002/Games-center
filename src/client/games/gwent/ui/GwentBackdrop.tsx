import { assetUrl } from '../../../core/assetUrl';
import styles from './gwentTheme.module.css';

const BACKGROUND_PATH = assetUrl('/assets/gwent/background.jpg');

/**
 * A real background photo behind every Gwent screen (Gwent-0c.2 §B, 1. pont)
 * — a `position: fixed` layer mounted once per themed page, sitting BEHIND
 * that page's own content (z-index -1, see gwentTheme.module.css's
 * `.backdrop`). Kept as its own tiny component (not baked into the CSS
 * module) because a public/-served path needs `assetUrl()`'s base-path
 * prefix, which plain CSS `url()` can't apply — see this file's own
 * gwentTheme.module.css doc comment.
 */
export function GwentBackdrop() {
  return <div className={styles.backdrop} style={{ backgroundImage: `url(${BACKGROUND_PATH})` }} />;
}
