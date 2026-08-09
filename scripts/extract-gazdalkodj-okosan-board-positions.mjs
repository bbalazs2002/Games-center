// Extracts the 6 hand-authored, per-player-slot position/rotation "lanes"
// baked into the raw full-board.glb — see
// docs/gazdalkodj-okosan-0c-vizual-specifikacio.md §2. The source contains
// figure-1-00..figure-6-00, each duplicated 42 times (`.001`..`.041`, plus
// the unsuffixed original as index 0) along the real board's perimeter, in
// board-space-index order — a real, author-placed anchor per space per
// player slot, not a synthetic/computed shape. Writes a static TS module so
// this data ships without ever loading the 14MB raw file at runtime (see the
// generated file's own header for why).
//
// Rerunnable: safe to run again after a new full-board.glb is dropped in.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

const SOURCE = join(repoRoot, 'assets', 'GazdalkodjOkosan', 'full-board', 'full-board.glb');
const TARGET = join(
  repoRoot,
  'src',
  'client',
  'games',
  'gazdalkodjOkosan',
  'ui',
  'gazdalkodjOkosanBoardLayout.generated.ts',
);

const SLOT_COUNT = 6;
const SPACE_COUNT = 42;
const IDENTITY_ROTATION = [0, 0, 0, 1];

function nodeIndexFor(slot, name) {
  const base = `figure-${slot}-00`;
  if (name === base) return 0;
  const match = name.match(new RegExp(`^${base}\\.(\\d+)$`));
  return match ? Number(match[1]) : null;
}

async function main() {
  const io = new NodeIO();
  const document = await io.read(SOURCE);
  const root = document.getRoot();

  const positionsBySlot = Array.from({ length: SLOT_COUNT }, () => new Array(SPACE_COUNT).fill(null));
  const rotationsBySlot = Array.from({ length: SLOT_COUNT }, () => new Array(SPACE_COUNT).fill(null));

  for (const node of root.listNodes()) {
    const name = node.getName();
    for (let slot = 1; slot <= SLOT_COUNT; slot++) {
      const spaceIndex = nodeIndexFor(slot, name);
      if (spaceIndex === null || spaceIndex >= SPACE_COUNT) continue;
      positionsBySlot[slot - 1][spaceIndex] = Array.from(node.getTranslation());
      rotationsBySlot[slot - 1][spaceIndex] = Array.from(node.getRotation());
    }
  }

  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    for (let space = 0; space < SPACE_COUNT; space++) {
      if (!positionsBySlot[slot][space]) throw new Error(`Missing position for slot ${slot + 1}, space ${space}`);
      if (!rotationsBySlot[slot][space]) rotationsBySlot[slot][space] = IDENTITY_ROTATION;
    }
  }

  const formatVec3 = (v) => `[${v.map((n) => n.toFixed(6)).join(', ')}]`;
  const formatQuat = (q) => `[${q.map((n) => n.toFixed(6)).join(', ')}]`;
  const formatSlots = (slots, formatEntry) =>
    `[\n${slots.map((spaces) => `  [${spaces.map(formatEntry).join(', ')}],`).join('\n')}\n]`;

  const contents = `// GENERATED FILE — do not edit by hand.
// Produced by scripts/extract-gazdalkodj-okosan-board-positions.mjs from the
// raw assets/GazdalkodjOkosan/full-board/full-board.glb — re-run that script
// to regenerate after the source model changes. See
// docs/gazdalkodj-okosan-0c-vizual-specifikacio.md §2 for why this is a
// baked/generated module rather than a runtime glb read: the position data
// is static, and the compressed pawn.glb the game actually ships (see
// scripts/compress-gazdalkodj-okosan-glb.mjs) has these anchor nodes pruned
// away — loading the 14MB raw file at runtime just to read node transforms
// would be wasteful.
//
// 6 player-slot "lanes" x 42 board spaces, each a hand-authored (Blender)
// anchor point — using these directly (never LoopTrackBoard3D's own
// procedural tokenSpreadRadius) is a deliberate choice: see
// feedback_loop_track_baked_positions in project memory.

/** [x, y, z] world-space anchor, per player slot (0-5) x board space index (0-41). */
export const GAZDALKODJ_SPACE_POSITIONS_BY_SLOT: readonly (readonly [number, number, number])[][] = ${formatSlots(positionsBySlot, formatVec3)};

/** [x, y, z, w] quaternion, per player slot (0-5) x board space index (0-41). Pawns are rotationally symmetric about the vertical axis, so this is not visually load-bearing for them — kept for completeness/future reuse. */
export const GAZDALKODJ_SPACE_ROTATIONS_BY_SLOT: readonly (readonly [number, number, number, number])[][] = ${formatSlots(rotationsBySlot, formatQuat)};

/** The uniform local scale every figure-N-00 node was baked with in Blender — apply this to the pawn model when placing it at any of the positions above. */
export const GAZDALKODJ_PAWN_SCALE = 0.02;
`;

  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, contents, 'utf8');
  console.log(`Wrote ${SLOT_COUNT * SPACE_COUNT} positions/rotations (${SLOT_COUNT} slots x ${SPACE_COUNT} spaces) to ${TARGET}`);
}

await main();
