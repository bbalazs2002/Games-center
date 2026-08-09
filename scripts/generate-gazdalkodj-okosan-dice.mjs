// Generates simple, non-photographic die-face textures (1-6 pips) for
// Gazdálkodj okosan's dice-roll animation — unlike Hotel, no real physical
// dice photo exists for this game (assets/GazdalkodjOkosan/ has no dice/
// folder). Cream/gold retro palette matching gazdalkodjOkosanTheme.module.css
// (#f5f0e0 face, #0d2b1f pips) rather than a plain white/black die, so it
// reads as belonging to this game's look. Rendered as SVG, rasterized via
// sharp (same tool every other asset script in this project already uses)
// — no new dependency (e.g. node-canvas) needed.
//
// Rerunnable: safe to run again (e.g. after a real dice photo becomes
// available and this script is retired/replaced).
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

const SIZE = 512;
const FACE_COLOR = '#f5f0e0';
const PIP_COLOR = '#0d2b1f';
const BORDER_COLOR = '#d4af37';
const PIP_RADIUS = SIZE * 0.075;

const TARGET_DIR = join(repoRoot, 'public', 'assets', 'gazdalkodj-okosan', 'dice');

// Standard 3x3 pip grid positions (fractions of SIZE), reused across faces.
const GRID = {
  topLeft: [0.25, 0.25],
  topRight: [0.75, 0.25],
  midLeft: [0.25, 0.5],
  center: [0.5, 0.5],
  midRight: [0.75, 0.5],
  bottomLeft: [0.25, 0.75],
  bottomRight: [0.75, 0.75],
};

const FACE_PIPS = {
  1: [GRID.center],
  2: [GRID.topLeft, GRID.bottomRight],
  3: [GRID.topLeft, GRID.center, GRID.bottomRight],
  4: [GRID.topLeft, GRID.topRight, GRID.bottomLeft, GRID.bottomRight],
  5: [GRID.topLeft, GRID.topRight, GRID.center, GRID.bottomLeft, GRID.bottomRight],
  6: [GRID.topLeft, GRID.topRight, GRID.midLeft, GRID.midRight, GRID.bottomLeft, GRID.bottomRight],
};

function pipsSvg(pips) {
  return pips.map(([fx, fy]) => `<circle cx="${fx * SIZE}" cy="${fy * SIZE}" r="${PIP_RADIUS}" fill="${PIP_COLOR}" />`).join('');
}

function faceSvg(value) {
  const borderWidth = SIZE * 0.03;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" fill="${FACE_COLOR}" />
    <rect x="${borderWidth / 2}" y="${borderWidth / 2}" width="${SIZE - borderWidth}" height="${SIZE - borderWidth}" rx="${SIZE * 0.08}" fill="${FACE_COLOR}" stroke="${BORDER_COLOR}" stroke-width="${borderWidth}" />
    ${pipsSvg(FACE_PIPS[value])}
  </svg>`;
}

async function main() {
  await mkdir(TARGET_DIR, { recursive: true });
  for (let value = 1; value <= 6; value += 1) {
    const outputPath = join(TARGET_DIR, `dice-${value}.jpg`);
    await sharp(Buffer.from(faceSvg(value))).jpeg({ quality: 90 }).toFile(outputPath);
    console.log(`generated ${outputPath}`);
  }
  console.log('\nDone: 6 placeholder dice-face textures generated. Replace with real photos later under the same filenames if/when available.');
}

await main();
