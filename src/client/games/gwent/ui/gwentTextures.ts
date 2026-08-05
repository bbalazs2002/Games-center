import { assetUrl } from '../../../core/assetUrl';

/**
 * Gwent-0d — shared decorative texture photos (wood tabletop, parchment,
 * hinge/frame metal), built by `scripts/build-gwent-assets.mjs`'s
 * `processTextures()` into `public/assets/gwent/textures/`. Exported as
 * `assetUrl()`-wrapped constants (not raw CSS `url()`) because a plain
 * string path in a CSS module resolves against the domain root, not the
 * deployed subpath — see GwentBackdrop.tsx's doc comment for the full
 * reasoning. Any component that needs one of these as a real photographic
 * texture (not just a flat color token) applies it via an inline style,
 * the same pattern GwentBackdrop.tsx uses for the wood background.
 */
export const WOOD_TEXTURE_PATH = assetUrl('/assets/gwent/textures/wood.jpg');
export const PARCHMENT_TEXTURE_PATH = assetUrl('/assets/gwent/textures/parchment.jpg');
export const PARCHMENT_ALT_TEXTURE_PATH = assetUrl('/assets/gwent/textures/parchment-alt.jpg');
export const METAL_TEXTURE_PATH = assetUrl('/assets/gwent/textures/metal.jpg');
export const RUST_METAL_TEXTURE_PATH = assetUrl('/assets/gwent/textures/rust-metal.jpg');
