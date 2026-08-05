import './gwentFonts';
import { WOOD_TEXTURE_PATH } from './gwentTextures';
import styles from './gwentTheme.module.css';

/**
 * A real wood-tabletop photo behind every Gwent screen — a `position: fixed`
 * layer mounted once per themed page, sitting BEHIND that page's own content
 * (z-index -1, see gwentTheme.module.css's `.backdrop`). Kept as its own tiny
 * component (not baked into the CSS module) because a public/-served path
 * needs `assetUrl()`'s base-path prefix, which plain CSS `url()` can't apply
 * — see this file's own gwentTheme.module.css doc comment.
 *
 * Gwent-0d: replaces the earlier low-resolution (426×240) "tavern photo"
 * mood reference with the user's own wood-grain texture — also the single
 * mount point for `gwentFonts.ts`'s side-effect imports (this component is
 * on every Gwent screen, setup and match alike).
 */
export function GwentBackdrop() {
  return <div className={styles.backdrop} style={{ backgroundImage: `url(${WOOD_TEXTURE_PATH})` }} />;
}
