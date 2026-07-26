// Resizes/compresses the curated Hotel reference photos down to something
// reasonable for a web app, writing straight into public/ (the only place
// these are actually served from — see docs/hotel-0c-specifikacio.md §3).
// Rerunnable: safe to run again after a new photo is curated/added.
import { readdir, mkdir } from 'node:fs/promises';
import { join, relative, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

// Longest side, in pixels — small enough for a texture/card image in a
// family-scale web app, large enough to still look sharp in a modal/UI
// panel. Aspect ratio is always preserved (sharp's fit: 'inside').
const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 82;

// Explicit (source, target) pairs, not a blanket mirror of assets/Hotel/**:
// assets/Hotel/raw-png/ also contains uncurated leftover candidate photos
// (e.g. unnamed garden/property-card shots that lost out to a better one)
// that were never meant to ship — only these subtrees are production-intended.
const SOURCE_TARGET_PAIRS = [
  [join(repoRoot, 'assets', 'Hotel', 'png'), join(repoRoot, 'public', 'assets', 'hotel')],
  [join(repoRoot, 'assets', 'Hotel', 'raw-png', 'buildings'), join(repoRoot, 'public', 'assets', 'hotel', 'buildings')],
  [join(repoRoot, 'assets', 'Hotel', 'raw-png', 'car'), join(repoRoot, 'public', 'assets', 'hotel', 'car')],
  [join(repoRoot, 'assets', 'Hotel', 'raw-png', 'stairs'), join(repoRoot, 'public', 'assets', 'hotel', 'stairs')],
];

async function findPngFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findPngFiles(fullPath)));
    } else if (extname(entry.name).toLowerCase() === '.png') {
      files.push(fullPath);
    }
  }
  return files;
}

// Garden pieces are irregularly-shaped cardboard cutouts, photographed on a
// near-black background (see docs/hotel-0c-specifikacio.md §5.2) — chroma-key
// those pixels to transparent so the decal blends into the board texture
// instead of showing as a black rectangle. Output stays PNG (needs alpha);
// everything else (full-frame photos: board/dice/cards/banknotes/buildings)
// keeps the JPEG path, where a transparent corner would be wrong.
const BLACK_BACKGROUND_DIRNAME = 'gardens';
const BLACK_THRESHOLD = 24; // max R/G/B value still considered "background"

async function chromaKeyBlackBackground(pipeline) {
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] <= BLACK_THRESHOLD && data[i + 1] <= BLACK_THRESHOLD && data[i + 2] <= BLACK_THRESHOLD) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

async function processOne(sourcePath, sourceRoot, targetRoot) {
  const rel = relative(sourceRoot, sourcePath);
  const isBlackBackground = dirname(rel).split(/[/\\]/).includes(BLACK_BACKGROUND_DIRNAME);
  const outputExt = isBlackBackground ? 'png' : 'jpg';
  const outputPath = join(targetRoot, dirname(rel), `${basename(rel, extname(rel))}.${outputExt}`);
  await mkdir(dirname(outputPath), { recursive: true });

  let pipeline = sharp(sourcePath).resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true });
  if (isBlackBackground) {
    pipeline = await chromaKeyBlackBackground(pipeline);
    await pipeline.png().toFile(outputPath);
  } else {
    await pipeline.jpeg({ quality: JPEG_QUALITY }).toFile(outputPath);
  }
  return outputPath;
}

async function main() {
  let converted = 0;
  for (const [sourceRoot, targetRoot] of SOURCE_TARGET_PAIRS) {
    const files = await findPngFiles(sourceRoot).catch(() => []);
    for (const sourcePath of files) {
      const outputPath = await processOne(sourcePath, sourceRoot, targetRoot);
      converted += 1;
      console.log(`${relative(repoRoot, sourcePath)} -> ${relative(repoRoot, outputPath)}`);
    }
  }
  console.log(`Done: ${converted} images resized/compressed into public/assets/hotel/.`);
}

await main();
