// GENERATED FILE — do not edit by hand.
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

export const GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT: GazdalkodjHouseItemLayout = { x: 0.000000, z: 0.000000, scaleX: 2.500000, scaleZ: 1.779801 };

export const GAZDALKODJ_HOUSE_ITEM_LAYOUT: Readonly<Record<string, GazdalkodjHouseItemLayout>> = {
  car: { x: 1.579648, z: 0.855806, scaleX: 0.761816, scaleZ: 0.736761 },
  livingroom: { x: 1.184125, z: -0.819487, scaleX: 1.175347, scaleZ: 0.815840 },
  kitchen: { x: -1.177243, z: -0.819978, scaleX: 1.172404, scaleZ: 0.811795 },
  fridge: { x: -1.988259, z: 0.877112, scaleX: 0.357562, scaleZ: 0.755703 },
  oven: { x: -1.207931, z: 0.872882, scaleX: 0.408137, scaleZ: 0.747345 },
  dishwasher: { x: -0.380998, z: 0.877939, scaleX: 0.392288, scaleZ: 0.746931 },
  washingMachine: { x: 0.409694, z: 0.872015, scaleX: 0.379174, scaleZ: 0.739969 },
};
