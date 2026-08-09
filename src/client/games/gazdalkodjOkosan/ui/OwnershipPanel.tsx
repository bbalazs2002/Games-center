import { ZoomableThumb } from '../../../ui-kit/ZoomableThumb';
import { ALL_FURNITURE_ITEMS } from '@shared/games/gazdalkodjOkosan/engine/furnitureCatalog';
import type { FurnitureItemId, OwnershipStatus } from '@shared/games/gazdalkodjOkosan/engine/state';
import { GAZDALKODJ_CAR_IMAGE, GAZDALKODJ_HOUSE_FURNITURE_IMAGE, gazdalkodjHouseImageUrl } from './gazdalkodjOkosanAssets';
import { GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT, GAZDALKODJ_HOUSE_ITEM_LAYOUT } from './gazdalkodjOkosanHouseLayout.generated';
import modalTheme from './gazdalkodjOkosanModalTheme.module.css';
import styles from './OwnershipPanel.module.css';

/**
 * The reference frame for positioning item photos MUST be the background
 * plane's own bounds (GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT) — NOT a bounding
 * box derived from the item nodes themselves (the previous approach). The
 * background image is rendered to fill this exact box (see .background's
 * object-fit: fill below), so every item's x/z/scaleX/scaleZ — already in
 * the same house.glb local-unit coordinate space — maps onto it precisely.
 * Real alignment bug found via live user testing/screenshots (2026-08-09) —
 * see docs/gazdalkodj-okosan-0c-vizual-specifikacio.md §10 addendum.
 */
const BOUNDS = {
  xMin: GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT.x - GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT.scaleX,
  xMax: GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT.x + GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT.scaleX,
  zMin: GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT.z - GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT.scaleZ,
  zMax: GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT.z + GAZDALKODJ_HOUSE_BACKGROUND_LAYOUT.scaleZ,
};

const BOUNDS_WIDTH = BOUNDS.xMax - BOUNDS.xMin;
const BOUNDS_HEIGHT = BOUNDS.zMax - BOUNDS.zMin;

/** Clicking a card zooms it — the position/size (§ extracted from house.glb) lives on the ZoomableThumb wrapper button, the visual styling (object-fit/border/shadow) on the inner image. */
function ItemCard({ imageName }: { imageName: string }) {
  const layout = GAZDALKODJ_HOUSE_ITEM_LAYOUT[imageName];
  // z maps directly to the vertical (top) axis, UNflipped — +z is visually
  // DOWN on the background image. (The previous "1 - " inversion here was
  // wrong — confirmed by live user testing/screenshot 2026-08-09: it put
  // the appliance row where the living-room/kitchen-cabinet row belongs,
  // and vice versa.)
  const left = ((layout.x - BOUNDS.xMin) / BOUNDS_WIDTH) * 100;
  const top = ((layout.z - BOUNDS.zMin) / BOUNDS_HEIGHT) * 100;
  const width = ((layout.scaleX * 2) / BOUNDS_WIDTH) * 100;
  const height = ((layout.scaleZ * 2) / BOUNDS_HEIGHT) * 100;
  return (
    <ZoomableThumb
      src={gazdalkodjHouseImageUrl(imageName)}
      alt=""
      wrapperClassName={styles.itemWrapper}
      wrapperStyle={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
      imageClassName={styles.item}
      modalClassName={modalTheme.gazdalkodjModal}
    />
  );
}

export interface OwnershipPanelProps {
  apartment: OwnershipStatus;
  car: OwnershipStatus;
  furniture: Record<FurnitureItemId, boolean>;
}

/**
 * Visual "furniture/car tracker" (docs/gazdalkodj-okosan-0c-vizual-specifikacio.md
 * §10) — recreates the physical paper tracker sheet's layout from house.glb's
 * extracted, author-placed positions/sizes. The furniture grid (background +
 * item photos) only shows once an apartment is owned — matches the engine's
 * own canBuyFurniture guard (furniture can never legally exist without an
 * apartment anyway). The car photo shows independently: a player can own a
 * car without ever owning an apartment.
 */
export function OwnershipPanel({ apartment, car, furniture }: OwnershipPanelProps) {
  const hasApartment = apartment.kind !== 'NONE';
  const hasCar = car.kind !== 'NONE';
  if (!hasApartment && !hasCar) return null;

  return (
    <div className={styles.panel} style={{ aspectRatio: `${BOUNDS_WIDTH} / ${BOUNDS_HEIGHT}` }}>
      {hasApartment && <img src={gazdalkodjHouseImageUrl('house')} alt="" className={styles.background} />}
      {hasApartment &&
        ALL_FURNITURE_ITEMS.filter((item) => furniture[item]).map((item) => (
          <ItemCard key={item} imageName={GAZDALKODJ_HOUSE_FURNITURE_IMAGE[item]} />
        ))}
      {hasCar && <ItemCard imageName={GAZDALKODJ_CAR_IMAGE} />}
    </div>
  );
}
