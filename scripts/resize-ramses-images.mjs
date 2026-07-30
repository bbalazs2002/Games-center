// Resizes/compresses the curated Ramses reference photos down to something
// reasonable for a web app, writing straight into public/ (the only place
// these are actually served from — see docs/ramses-0a-specifikacio.md §8.1).
// Rerunnable: safe to run again after a new photo is curated/added.
import { readdir, mkdir } from 'node:fs/promises';
import { join, relative, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

// Longest side, in pixels — same convention as resize-hotel-images.mjs.
const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 82;

const SOURCE_ROOT = join(repoRoot, 'assets', 'Ramses', 'png');
const TARGET_ROOT = join(repoRoot, 'public', 'assets', 'ramses');

// Explicit (source, not a blanket mirror of assets/Ramses/png/**): that
// folder also has its own box.png (the HomePage tile-grid cover photo) sitting
// right next to board/cards — already handled by resize-box-covers.mjs's own
// pipeline (different MAX_DIMENSION/target). Walking the whole tree here
// would silently re-resize and overwrite that file with different settings —
// real mistake caught in this file's very first run (2026-07-30) — so only
// these two subtrees are ever walked.
const SOURCE_SUBDIRS = ['board', 'cards'];

// `cards.xcf` (the GIMP source file, see §8.1) is explicitly NOT part of the
// pipeline — only real PNGs get processed.
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

// `board/**` (frame.png, empty.png, the 12 treasure icons) genuinely need
// alpha — they're composited as overlay layers on top of one another (see
// §8.1's renderer-oldali terv) — everything else (`cards/**`, real
// photographed cards) is a fully opaque rectangle (confirmed: alpha channel
// is uniformly 255 across every sampled card file), so it gets the much
// smaller JPEG path instead, mirroring resize-hotel-images.mjs's identical
// full-frame-photo vs. needs-alpha split.
function needsAlpha(sourcePath) {
  return relative(SOURCE_ROOT, sourcePath).split(/[/\\]/)[0] === 'board';
}

async function processOne(sourcePath) {
  const rel = relative(SOURCE_ROOT, sourcePath);
  const outputExt = needsAlpha(sourcePath) ? 'png' : 'jpg';
  const outputPath = join(TARGET_ROOT, dirname(rel), `${basename(rel, extname(rel))}.${outputExt}`);
  await mkdir(dirname(outputPath), { recursive: true });

  const pipeline = sharp(sourcePath).resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true });
  if (needsAlpha(sourcePath)) {
    await pipeline.png({ compressionLevel: 9 }).toFile(outputPath);
  } else {
    await pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: JPEG_QUALITY }).toFile(outputPath);
  }
  return outputPath;
}

async function main() {
  let converted = 0;
  for (const subdir of SOURCE_SUBDIRS) {
    const files = await findPngFiles(join(SOURCE_ROOT, subdir)).catch(() => []);
    for (const sourcePath of files) {
      const outputPath = await processOne(sourcePath);
      converted += 1;
      console.log(`${relative(repoRoot, sourcePath)} -> ${relative(repoRoot, outputPath)}`);
    }
  }
  console.log(`Done: ${converted} images resized/compressed into public/assets/ramses/.`);
}

await main();
