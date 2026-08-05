/**
 * Gwent-0d (docs/gwent-0d-vizualis-ujratervezes-specifikacio.md) — self-hosted
 * display/body typefaces, a deliberate exception to the project's usual
 * "system font stack only" rule (see gwentTheme.module.css's own header
 * comment for the earlier, pre-0d reasoning). Approved by the user
 * specifically for Gwent, to get closer to the original game's lettering.
 *
 * `@fontsource` packages are npm dependencies (bundled by Vite at build
 * time), not a CDN — no runtime network request outside the app's own
 * origin, satisfying the same "no external calls" constraint the old
 * system-stack rule existed for. Each imported weight file bundles BOTH the
 * basic-Latin and Latin-Extended-A `@font-face` blocks (confirmed by reading
 * the package output), so Hungarian diacritics (á é í ó ö ő ú ü ű) render
 * correctly without importing separate `-ext` files.
 *
 * Side-effect only — imported once from GwentBackdrop.tsx, which is mounted
 * on every Gwent screen (setup AND match).
 */
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/600.css';
import '@fontsource/eb-garamond/600-italic.css';
