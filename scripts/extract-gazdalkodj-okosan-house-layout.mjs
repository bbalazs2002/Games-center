// Extracts the furniture/car "ownership grid" layout baked into the raw
// house.glb — see docs/gazdalkodj-okosan-0c-vizual-specifikacio.md §10. The
// glb's own node names are meaningless Blender defaults (`Empty`,
// `Empty.002`..), but each node's material points at exactly one already-
// separately-delivered images/house/*.png file, identifiable by name
// (material -> baseColorTexture -> image.name) — that's what this script
// keys off, not the fragile node names. house.glb itself is never loaded at
// runtime (its geometry is trivial flat quads with zero extra information
// beyond this position/scale data) — only this generated layout ships.
//
// Rerunnable: safe to run again after a new house.glb is dropped in.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

const SOURCE = join(repoRoot, 'assets', 'GazdalkodjOkosan', 'house', 'house.glb');
const TARGET = join(
  repoRoot,
  'src',
  'client',
  'games',
  'gazdalkodjOkosan',
  'ui',
  'gazdalkodjOkosanHouseLayout.generated.ts',
);

// Real bug found via live user testing/screenshots (2026-08-09): the item
// photos didn't line up with the background grid's printed cells. Root
// cause was twofold — (1) the background ("house") node's own bounding box
// was never captured at all (item positions were normalized against a bbox
// derived from the ITEMS themselves, which doesn't match the background
// plane's real extent), and (2) even for the items, `node.getScale()` was
// wrongly assumed to equal each card's half-extent directly — i.e. that
// every node's underlying mesh is an exact 2x2-unit quad centered on its own
// origin. Inspecting the raw POSITION accessor data (2026-08-09) showed this
// is false: e.g. `fridge`/`oven`/`washingMachine`'s local mesh geometry
// isn't even centered at their own local origin. The correct, geometry-
// agnostic approach — used here for EVERY node, background included — is to
// read the mesh's actual local-space bounding box and combine it with the
// node's translation+scale to get the true world-space center/half-extent,
// rather than trusting the transform's translation/scale alone.
function worldBounds(node) {
  const mesh = node.getMesh();
  const primitive = mesh.listPrimitives()[0];
  const position = primitive.getAttribute('POSITION');
  const [localMinX, , localMinZ] = position.getMin([]);
  const [localMaxX, , localMaxZ] = position.getMax([]);
  const [tx, , tz] = node.getTranslation();
  const [sx, , sz] = node.getScale();
  const worldMinX = tx + localMinX * sx;
  const worldMaxX = tx + localMaxX * sx;
  const worldMinZ = tz + localMinZ * sz;
  const worldMaxZ = tz + localMaxZ * sz;
  return {
    x: (worldMinX + worldMaxX) / 2,
    z: (worldMinZ + worldMaxZ) / 2,
    scaleX: (worldMaxX - worldMinX) / 2,
    scaleZ: (worldMaxZ - worldMinZ) / 2,
  };
}

async function main() {
  const io = new NodeIO();
  const document = await io.read(SOURCE);
  const root = document.getRoot();

  const items = {};
  let background;
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const material = mesh.listPrimitives()[0]?.getMaterial();
    const imageName = material?.getBaseColorTexture()?.getName();
    if (!imageName) continue;
    const bounds = worldBounds(node);
    if (imageName === 'house') {
      background = bounds;
      continue;
    }
    items[imageName] = bounds;
  }

  const expected = ['car', 'kitchen', 'livingroom', 'fridge', 'oven', 'dishwasher', 'washingMachine'];
  for (const name of expected) {
    if (!items[name]) throw new Error(`Missing expected house.glb item: ${name}`);
  }
  if (!background) throw new Error('Missing house.glb background ("house") node — needed so the overlay item positions and the background image share the same coordinate space.');

  const formatEntry = ({ x, z, scaleX, scaleZ }) =>
    `{ x: ${x.toFixed(6)}, z: ${z.toFixed(6)}, scaleX: ${scaleX.toFixed(6)}, scaleZ: ${scaleZ.toFixed(6)} }`;

  const contents = `// GENERATED FILE — do not edit by hand.
// Produced by scripts/extract-gazdalkodj-okosan-house-layout.mjs from the
// raw assets/GazdalkodjOkosan/house/house.glb — re-run that script to
// regenerate after the source model changes. See
// docs/gazdalkodj-okosan-0c-vizual-specifikacio.md §10.
//
// Keyed by image name (car.jpg/kitchen.jpg/... under
// public/assets/gazdalkodj-okosan/house/), NOT FurnitureItemId — see
// GAZDALKODJ_HOUSE_FURNITURE_IMAGE in gazdalkodjOkosanAssets.ts for the
// image-name <-> FurnitureItemId mapping.
//
// x/z are house.glb's own local units (Y dropped — every card lies flat on
// one shared ground plane), each node's TRUE world-space center — NOT its
// raw translation, which for several nodes (fridge/oven/washingMachine) is
// off-center relative to their own mesh geometry. scaleX/scaleZ are each
// card's real half-extent (translation/scale combined with the mesh's own
// local-space bounding box) — NOT the node's raw scale property, which does
// not equal the half-extent unless the underlying mesh happens to be an exact
// 2x2-unit quad (it isn't, for several items). OwnershipPanel normalizes
// these into CSS percentages against GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT's
// own bounds (computed the same way) so the overlaid item photos and the
// background image share one coordinate space. See docs §10 addendum
// (2026-08-09) for the full story of the alignment bug this fixed.

export interface GazdalkodjHouseItemLayout {
  readonly x: number;
  readonly z: number;
  readonly scaleX: number;
  readonly scaleZ: number;
}

export const GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT: GazdalkodjHouseItemLayout = ${formatEntry(background)};

export const GAZDALKODJ_HOUSE_ITEM_LAYOUT: Readonly<Record<string, GazdalkodjHouseItemLayout>> = {
${Object.entries(items)
  .map(([name, entry]) => `  ${name}: ${formatEntry(entry)},`)
  .join('\n')}
};
`;

  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, contents, 'utf8');
  console.log(`Wrote ${Object.keys(items).length} item layouts to ${TARGET}`);
}

await main();
