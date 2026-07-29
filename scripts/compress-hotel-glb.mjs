// Resizes/recompresses the Blender-authored combined Hotel board scene down
// to something reasonable for a web app, writing into public/ (the only
// place it's actually served from) — same "raw source in assets/Hotel/,
// production-ready derivative in public/assets/hotel/" split as
// resize-hotel-images.mjs, just for the 3D scene instead of the 2D photos.
//
// The source export embeds all textures as full-resolution, lossless PNG —
// fine for a Blender working file, but 100+MB is not something a browser
// should ever download. Resize + JPEG-recompress alone accounts for nearly
// all of that (the mesh/geometry data itself is a few MB at most).
//
// Deliberately does NOT use gltf-transform's `optimize` command — its
// defaults (--flatten/--join/--instance/--palette all true) merge/rename
// scene nodes, which would break GLTFSceneObject.tsx's
// `scene.getObjectByName(objectName)` lookup (every hotel building/stairs/
// car is a distinct, individually-named node — see docs/hotel-0c-specifikacio.md
// §5.5). Only texture-level transforms (resize, jpeg, dedup) run, which never
// touch node names.
//
// Rerunnable: safe to run again after a new .glb is dropped in.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

const SOURCE = join(repoRoot, 'assets', 'Hotel', 'full-board.glb');
const TARGET = join(repoRoot, 'public', 'assets', 'hotel', 'full-board.glb');
const TMP_A = join(repoRoot, 'temp', 'full-board.resized.glb');
const TMP_B = join(repoRoot, 'temp', 'full-board.jpeg.glb');

// Matches resize-hotel-images.mjs's own constants — same "small enough for a
// texture in a family-scale web app, sharp enough up close" reasoning.
const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 82;

// npx on Windows is a .cmd shim that needs real shell interpretation (a bare
// execFileSync without shell:true fails with EINVAL). Node emits a
// DEP0190 warning for shell:true + an args array — harmless here, every
// argument is a hardcoded path or literal flag, never untrusted input.
function run(args) {
  execFileSync('npx', ['gltf-transform', ...args], { stdio: 'inherit', cwd: repoRoot, shell: true });
}

function main() {
  if (!existsSync(SOURCE)) {
    console.error(`Source not found: ${SOURCE}`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(dirname(TARGET), { recursive: true });
  mkdirSync(dirname(TMP_A), { recursive: true });

  console.log('1/3 resize (max 1024px per side, aspect preserved)...');
  run(['resize', SOURCE, TMP_A, '--width', String(MAX_DIMENSION), '--height', String(MAX_DIMENSION)]);

  console.log('2/3 recompress PNG textures as JPEG (photographic content, no alpha needed)...');
  run(['jpeg', TMP_A, TMP_B, '--formats', 'png', '--quality', String(JPEG_QUALITY)]);

  console.log('3/3 dedup (merge byte-identical textures/accessors, e.g. shared stairs geometry)...');
  run(['dedup', TMP_B, TARGET]);

  unlinkSync(TMP_A);
  unlinkSync(TMP_B);

  const before = statSync(SOURCE).size;
  const after = statSync(TARGET).size;
  console.log(
    `\nDone: ${(before / 1024 / 1024).toFixed(1)}MB -> ${(after / 1024 / 1024).toFixed(1)}MB ` +
      `(${(100 - (after / before) * 100).toFixed(0)}% smaller)`,
  );
}

main();
