// One-off/rerunnable utility: mirrors assets/Hotel/raw-heic/** into
// assets/Hotel/raw-png/** as plain PNGs, so the HEIC photos (unreadable by
// most tooling, including Claude's own image viewer) become viewable and
// usable as texture/reference material. Pure mechanical mirror, no renaming
// or curation — that already happened by hand for assets/Hotel/png/, which
// this script does not touch. Both assets/Hotel/raw-heic and
// assets/Hotel/raw-png are gitignored (see docs/hotel-0c-specifikacio.md).
import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import convert from 'heic-convert';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const sourceRoot = join(repoRoot, 'assets', 'Hotel', 'raw-heic');
const targetRoot = join(repoRoot, 'assets', 'Hotel', 'raw-png');

async function findHeicFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findHeicFiles(fullPath)));
    } else if (extname(entry.name).toLowerCase() === '.heic') {
      files.push(fullPath);
    }
  }
  return files;
}

async function outputPathFor(sourcePath) {
  const rel = relative(sourceRoot, sourcePath);
  const relPng = join(dirname(rel), `${basename(rel, extname(rel))}.png`);
  return join(targetRoot, relPng);
}

async function convertOne(sourcePath) {
  const outputPath = await outputPathFor(sourcePath);
  const inputBuffer = await readFile(sourcePath);
  const outputBuffer = await convert({ buffer: inputBuffer, format: 'PNG' });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, outputBuffer);
  return outputPath;
}

async function main() {
  const heicFiles = await findHeicFiles(sourceRoot);
  let converted = 0;
  for (const sourcePath of heicFiles) {
    const outputPath = await convertOne(sourcePath);
    converted += 1;
    console.log(`${relative(repoRoot, sourcePath)} -> ${relative(repoRoot, outputPath)}`);
  }
  console.log(`Done: ${converted}/${heicFiles.length} files converted.`);
}

await main();
