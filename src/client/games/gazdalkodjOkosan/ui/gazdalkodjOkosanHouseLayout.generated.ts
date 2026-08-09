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
  car: { x: 1.579648, z: 0.855806, scaleX: 0.304727, scaleZ: 0.307197 },
  livingroom: { x: 1.184125, z: -0.819487, scaleX: 0.470139, scaleZ: 0.425576 },
  kitchen: { x: -1.177243, z: -0.819978, scaleX: 0.468962, scaleZ: 0.435536 },
  fridge: { x: -1.954654, z: 0.877112, scaleX: 0.340014, scaleZ: 0.330691 },
  oven: { x: -1.166868, z: 0.872882, scaleX: 0.316232, scaleZ: 0.329015 },
  dishwasher: { x: -0.380998, z: 0.877939, scaleX: 0.286667, scaleZ: 0.298772 },
  washingMachine: { x: 1.397396, z: 0.872015, scaleX: 1.043555, scaleZ: 1.067000 },
};
