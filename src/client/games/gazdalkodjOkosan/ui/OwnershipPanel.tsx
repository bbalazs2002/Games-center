import { ZoomableThumb } from '../../../ui-kit/ZoomableThumb';
import { ALL_FURNITURE_ITEMS } from '@shared/games/gazdalkodjOkosan/engine/furnitureCatalog';
import type { FurnitureItemId, OwnershipStatus } from '@shared/games/gazdalkodjOkosan/engine/state';
import { GAZDALKODJ_CAR_IMAGE, GAZDALKODJ_HOUSE_FURNITURE_IMAGE, gazdalkodjHouseImageUrl } from './gazdalkodjOkosanAssets';
import { GAZDALKODJ_HOUSE_ITEM_LAYOUT } from './gazdalkodjOkosanHouseLayout.generated';
import modalTheme from './gazdalkodjOkosanModalTheme.module.css';
import styles from './OwnershipPanel.module.css';

// Extra margin around the combined item bounding box so no card's edge sits flush against the panel border.
const PADDING = 0.2;

const ITEM_NAMES = Object.keys(GAZDALKODJ_HOUSE_ITEM_LAYOUT);

const BOUNDS = (() => {
  let xMin = Infinity;
  let xMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const name of ITEM_NAMES) {
    const { x, z, scaleX, scaleZ } = GAZDALKODJ_HOUSE_ITEM_LAYOUT[name];
    xMin = Math.min(xMin, x - scaleX);
    xMax = Math.max(xMax, x + scaleX);
    zMin = Math.min(zMin, z - scaleZ);
    zMax = Math.max(zMax, z + scaleZ);
  }
  return { xMin: xMin - PADDING, xMax: xMax + PADDING, zMin: zMin - PADDING, zMax: zMax + PADDING };
})();

const BOUNDS_WIDTH = BOUNDS.xMax - BOUNDS.xMin;
const BOUNDS_HEIGHT = BOUNDS.zMax - BOUNDS.zMin;

/** Clicking a card zooms it — the position/size (§ extracted from house.glb) lives on the ZoomableThumb wrapper button, the visual styling (object-fit/border/shadow) on the inner image. */
function ItemCard({ imageName }: { imageName: string }) {
  const layout = GAZDALKODJ_HOUSE_ITEM_LAYOUT[imageName];
  // z maps to the vertical (top) axis, flipped — house.glb's ground plane
  // convention (like the board's own) has +z reading "up" visually, not
  // inverted, matching how the physical tracker sheet was laid out.
  const left = ((layout.x - BOUNDS.xMin) / BOUNDS_WIDTH) * 100;
  const top = (1 - (layout.z - BOUNDS.zMin) / BOUNDS_HEIGHT) * 100;
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
