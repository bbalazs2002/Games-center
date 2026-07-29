import * as THREE from 'three';

function tintMaterial(material: THREE.Material, colorTint: string): THREE.Material {
  const cloned = material.clone();
  if (
    cloned instanceof THREE.MeshStandardMaterial ||
    cloned instanceof THREE.MeshPhongMaterial ||
    cloned instanceof THREE.MeshBasicMaterial ||
    cloned instanceof THREE.MeshLambertMaterial
  ) {
    cloned.color.set(colorTint);
  }
  return cloned;
}

/**
 * Deep-clones an object (geometry stays shared, materials get their own
 * copies) so a color tint never leaks back into the cached original or other
 * instances of the same model — shared by ScannedModel (OBJ+MTL) and
 * GLTFSceneObject (glTF/GLB), the same per-instance recolor need either way
 * (e.g. one car model in 4 player colors).
 */
export function cloneWithTint(source: THREE.Object3D, colorTint?: string): THREE.Object3D {
  const clone = source.clone(true);
  if (!colorTint) return clone;
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => tintMaterial(material, colorTint))
      : tintMaterial(child.material, colorTint);
  });
  return clone;
}

function fadeMaterial(material: THREE.Material, opacity: number): THREE.Material {
  const cloned = material.clone();
  cloned.transparent = true;
  cloned.opacity = opacity;
  // A translucent "ghost" preview shouldn't occlude/get occluded oddly against
  // itself or other transparent objects (depth-buffer sorting artifacts are
  // far more visible at partial opacity than full) — fine to skip depth
  // writes here since this is only ever used for non-interactive-with-depth
  // preview markers, never real solid geometry.
  cloned.depthWrite = false;
  return cloned;
}

/**
 * Deep-clones an object with every material forced translucent at a fixed
 * opacity — used for "ghost" placement previews (e.g. Hotel's clickable
 * staircase-location markers, see `StaircaseCandidateOverlay` in
 * `HotelGamePage.tsx`) where the real, eventual object's own geometry/texture
 * should be recognizable, just faded. `opacity` alone (no color change)
 * works for any material type, unlike `cloneWithTint`'s `color` property,
 * which only exists on some — no `instanceof` narrowing needed here.
 */
export function cloneWithOpacity(source: THREE.Object3D, opacity: number): THREE.Object3D {
  const clone = source.clone(true);
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => fadeMaterial(material, opacity))
      : fadeMaterial(child.material, opacity);
  });
  return clone;
}
