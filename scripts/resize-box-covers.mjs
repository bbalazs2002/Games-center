// Resizes/compresses each game's curated box-cover photo down to something
// reasonable for HomePage's tile grid, writing into public/assets/<gameId>/
// (the only place these are actually served from — see
// docs/shell-ux-specifikacio.md §5.2). Rerunnable: safe to run again after a
// new/replacement photo is curated. Kept separate from resize-hotel-images.mjs
// since that script's chroma-keying/multi-subfolder logic is Hotel-specific;
// this one is a flat, game-agnostic id -> source-photo mapping instead.
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

// Longest side, in pixels — plenty for an 11rem-wide grid tile, even at high
// DPI; source photos run 14-16MB straight off a phone camera, nowhere near
// web-appropriate. Aspect ratio always preserved (sharp's fit: 'inside'), no
// cropping — HomePage's own CSS (object-fit: contain) handles fitting
// whatever aspect ratio a box photo happens to have, since box shapes/photo
// angles vary per game and a hardcoded crop would risk cutting off a title.
const MAX_DIMENSION = 800;
const JPEG_QUALITY = 82;

// gameId -> source box-cover photo, keyed to match gamesRegistry.ts's ids.
// Not every game needs an entry here — HomePage falls back to a monogram
// tile when a game has no coverImage yet.
const SOURCES = {
  dama: join(repoRoot, 'assets', 'Checkers', 'box.png'),
  hotel: join(repoRoot, 'assets', 'Hotel', 'png', 'box.png'),
  ramses: join(repoRoot, 'assets', 'Ramses', 'png', 'box.png'),
};

async function main() {
  let converted = 0;
  for (const [gameId, sourcePath] of Object.entries(SOURCES)) {
    const outputDir = join(repoRoot, 'public', 'assets', gameId);
    const outputPath = join(outputDir, 'box.jpg');
    await mkdir(outputDir, { recursive: true });
    await sharp(sourcePath)
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toFile(outputPath);
    converted += 1;
    console.log(`${join('assets', gameId)} <- ${sourcePath} -> ${outputPath}`);
  }
  console.log(`Done: ${converted} box-cover images resized/compressed into public/assets/<gameId>/box.jpg.`);
}

await main();
