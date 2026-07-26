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
