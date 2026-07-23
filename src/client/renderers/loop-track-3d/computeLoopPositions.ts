import { Vector3 } from 'three';

export interface LoopDimensions {
  width: number;
  depth: number;
}

const DEFAULT_DIMENSIONS: LoopDimensions = { width: 12, depth: 12 };

/**
 * Places `count` points evenly (by arc-length) around a rounded-rectangle
 * loop in the XZ plane (Y=0) — a deliberately simple placeholder shape, NOT
 * a recreation of any specific physical board's actual outline (see
 * docs/hotel-0a-specifikacio.md §5: the real board's organic shape only
 * matters for Hotel-0c "assets", not this engine-agnostic renderer).
 */
export function computeLoopPositions(count: number, dimensions: LoopDimensions = DEFAULT_DIMENSIONS): Vector3[] {
  if (count <= 0) return [];
  const { width, depth } = dimensions;
  const perimeter = 2 * (width + depth);
  return Array.from({ length: count }, (_, i) => pointAtDistance((i / count) * perimeter, width, depth));
}

/** Walks the rectangle's perimeter clockwise from the top-left corner. */
function pointAtDistance(distance: number, width: number, depth: number): Vector3 {
  const halfW = width / 2;
  const halfD = depth / 2;
  let remaining = distance;

  if (remaining < width) return new Vector3(-halfW + remaining, 0, -halfD);
  remaining -= width;

  if (remaining < depth) return new Vector3(halfW, 0, -halfD + remaining);
  remaining -= depth;

  if (remaining < width) return new Vector3(halfW - remaining, 0, halfD);
  remaining -= width;

  return new Vector3(-halfW, 0, halfD - remaining);
}
