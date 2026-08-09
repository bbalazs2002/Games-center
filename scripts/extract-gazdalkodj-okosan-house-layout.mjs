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

async function main() {
  const io = new NodeIO();
  const document = await io.read(SOURCE);
  const root = document.getRoot();

  const items = {};
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const material = mesh.listPrimitives()[0]?.getMaterial();
    const imageName = material?.getBaseColorTexture()?.getName();
    if (!imageName || imageName === 'house') continue;
    const [x, , z] = node.getTranslation();
    const [scaleX, , scaleZ] = node.getScale();
    items[imageName] = { x, z, scaleX, scaleZ };
  }

  const expected = ['car', 'kitchen', 'livingroom', 'fridge', 'oven', 'dishwasher', 'washingMachine'];
  for (const name of expected) {
    if (!items[name]) throw new Error(`Missing expected house.glb item: ${name}`);
  }

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
// one shared ground plane); scaleX/scaleZ are the card's own half-extent in
// the same units. OwnershipPanel normalizes these into CSS percentages
// against this dataset's own combined bounding box.

export interface GazdalkodjHouseItemLayout {
  readonly x: number;
  readonly z: number;
  readonly scaleX: number;
  readonly scaleZ: number;
}

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
