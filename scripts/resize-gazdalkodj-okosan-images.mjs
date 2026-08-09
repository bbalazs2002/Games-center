// Resizes/compresses the curated Gazdálkodj okosan reference photos down to
// something reasonable for a web app, writing straight into public/ (the
// only place these are actually served from) — same "raw source in
// assets/GazdalkodjOkosan/, production-ready derivative in
// public/assets/gazdalkodj-okosan/" split as resize-ramses-images.mjs.
// Rerunnable: safe to run again after a new photo is curated/added.
//
// Every source photo here is a full-frame opaque photo (board, bank card,
// furniture/car ads, banknotes) — no alpha/chroma-key handling needed,
// unlike resize-ramses-images.mjs's board/ subtree.
//
// Aspect ratio is ALWAYS preserved (sharp's `fit: 'inside'`, no cropping) —
// critical specifically for house/*.png: their exact aspect ratio is what
// the (separately extracted) GAZDALKODJ_HOUSE_ITEM_LAYOUT position/scale
// data was authored against in Blender. Changing an image's aspect ratio
// here would misalign the OwnershipPanel's photo cards against that data.
//
// box.png is deliberately NOT handled here — that one goes through
// resize-box-covers.mjs's own SOURCES map (different MAX_DIMENSION/target,
// see that script's own comment on why re-walking its file here would be a
// mistake).
import { readdir, mkdir } from 'node:fs/promises';
import { join, relative, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

// Longest side, in pixels — same convention as resize-hotel-images.mjs/resize-ramses-images.mjs.
const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 82;

const SOURCE_ROOT = join(repoRoot, 'assets', 'GazdalkodjOkosan', 'images');
const TARGET_ROOT = join(repoRoot, 'public', 'assets', 'gazdalkodj-okosan');

// Explicit files/subdirs, not a blanket mirror of images/** — box.png sits
// right next to these and is handled by a different pipeline (see header).
const SOURCE_ENTRIES = ['board.png', 'card', 'house', 'money'];

async function findPngFiles(path) {
  const stat = await readdir(dirname(path), { withFileTypes: true }).catch(() => []);
  const name = basename(path);
  const entry = stat.find((e) => e.name === name);
  if (!entry) return [];
  if (entry.isFile()) return extname(name).toLowerCase() === '.png' ? [path] : [];
  const files = [];
  const children = await readdir(path, { withFileTypes: true });
  for (const child of children) {
    const childPath = join(path, child.name);
    if (child.isDirectory()) files.push(...(await findPngFiles(childPath)));
    else if (extname(child.name).toLowerCase() === '.png') files.push(childPath);
  }
  return files;
}

async function processOne(sourcePath) {
  const rel = relative(SOURCE_ROOT, sourcePath);
  const outputPath = join(TARGET_ROOT, dirname(rel), `${basename(rel, extname(rel))}.jpg`);
  await mkdir(dirname(outputPath), { recursive: true });

  await sharp(sourcePath)
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(outputPath);
  return outputPath;
}

async function main() {
  let converted = 0;
  for (const entry of SOURCE_ENTRIES) {
    const files = await findPngFiles(join(SOURCE_ROOT, entry));
    for (const sourcePath of files) {
      const outputPath = await processOne(sourcePath);
      converted += 1;
      console.log(`${relative(repoRoot, sourcePath)} -> ${relative(repoRoot, outputPath)}`);
    }
  }
  console.log(`Done: ${converted} images resized/compressed into public/assets/gazdalkodj-okosan/.`);
}

await main();
