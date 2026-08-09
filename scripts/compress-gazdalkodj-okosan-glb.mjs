// Extracts a single, small pawn model out of the raw, Blender-authored
// full-board.glb, writing into public/ (the only place it's actually served
// from) — same "raw source in assets/GazdalkodjOkosan/, production-ready
// derivative in public/assets/gazdalkodj-okosan/" split as
// resize-gazdalkodj-okosan-images.mjs, just for the 3D pawn instead of 2D
// photos.
//
// Unlike compress-hotel-glb.mjs, this is NOT a texture-recompression pass —
// the source's size (15MB) is almost entirely 246 unwanted duplicate pawn
// meshes (a Blender reference array showing all 6 pawn "lanes" placed at all
// 42 board spaces — see gazdalkodj-okosan-0c-vizual-specifikacio.md §2) plus
// one flat board-photo quad that's redundant with board.jpg (already handled
// by resize-gazdalkodj-okosan-images.mjs). The 6 pawn shapes are themselves
// confirmed geometrically identical (per-player color comes from
// cloneWithTint at runtime, not from the source file), so only ONE of the 6
// canonical (non-duplicated) pawn nodes needs to survive.
//
// Deliberately uses @gltf-transform/core + @gltf-transform/functions
// directly (Document-level node removal), not gltf-transform's CLI — the
// win here is node pruning, not texture transforms, which the CLI's
// resize/jpeg/dedup commands don't do.
//
// Rerunnable: safe to run again after a new full-board.glb is dropped in.
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune } from '@gltf-transform/functions';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

const SOURCE = join(repoRoot, 'assets', 'GazdalkodjOkosan', 'full-board', 'full-board.glb');
const TARGET = join(repoRoot, 'public', 'assets', 'gazdalkodj-okosan', 'pawn.glb');

// The one canonical pawn node to keep — see header. Every OTHER
// `figure-<n>-00[.NNN]` node (the board-plane quad `Empty.001` included) is
// a duplicate/reference placement and gets removed.
const KEEP_NODE_NAME = 'figure-1-00';

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(`Source not found: ${SOURCE}`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(dirname(TARGET), { recursive: true });

  const io = new NodeIO();
  const document = await io.read(SOURCE);
  const root = document.getRoot();

  const scene = root.listScenes()[0];
  let kept = 0;
  let removed = 0;
  for (const node of root.listNodes()) {
    if (node.getName() === KEEP_NODE_NAME) {
      kept += 1;
      continue;
    }
    // Detach from the scene graph and dispose — prune() below then garbage
    // collects any mesh/material/accessor/texture left with no remaining
    // reference (e.g. the 245 other pawn duplicates' meshes, the board
    // quad's mesh+texture).
    node.dispose();
    removed += 1;
  }
  console.log(`kept 1 node (${KEEP_NODE_NAME}), removed ${removed} other node(s) from scene "${scene?.getName() ?? '(default)'}"`);

  await document.transform(prune(), dedup());

  await io.write(TARGET, document);

  const before = statSync(SOURCE).size;
  const after = statSync(TARGET).size;
  console.log(
    `\nDone: ${(before / 1024 / 1024).toFixed(1)}MB -> ${(after / 1024).toFixed(1)}KB ` +
      `(${(100 - (after / before) * 100).toFixed(1)}% smaller)`,
  );
}

await main();
