import { useMemo, type ReactNode } from 'react';
import { cloneWithTint } from './materialTint';
import { useGLTFScene } from './useGLTFScene';

export interface GLTFSceneObjectProps {
  /** Public-served .glb/.gltf URL — may contain many named objects (e.g. one Blender scene with all 8 hotels); every consumer of the same url shares one fetch+parse. */
  url: string;
  /** Name of the object/group inside the scene to render, exactly as authored in Blender (Outliner name). */
  objectName: string;
  /** Overrides every material's color on a per-instance clone — never mutates the cached loaded scene. */
  colorTint?: string;
  /** Rendered while loading and if the scene/object fails to load (wrong url, or the named object isn't in it yet). */
  fallback?: ReactNode;
  /** Overrides the object's own baked scale — omit to keep whatever scale it was authored with (the safe default: an object with a non-1 baked scale, e.g. from a Blender unit-scale mismatch, would otherwise silently get reset to 1x). */
  scale?: number;
}

/**
 * Renders one named object out of a real, Blender-authored glTF/GLB scene
 * (see docs/hotel-0c-specifikacio.md §5.5) once it exists at the given URL,
 * falling back to caller-supplied placeholder geometry until then. Sibling
 * to ScannedModel (OBJ+MTL, single object per file) — this is for a combined
 * multi-object scene export instead, still renderer/game-agnostic.
 */
export function GLTFSceneObject({ url, objectName, colorTint, fallback = null, scale }: GLTFSceneObjectProps) {
  const scene = useGLTFScene(url);

  const found = useMemo(() => (scene ? (scene.getObjectByName(objectName) ?? null) : null), [scene, objectName]);
  const tinted = useMemo(() => (found ? cloneWithTint(found, colorTint) : null), [found, colorTint]);

  if (!tinted) return <>{fallback}</>;
  // dispose={null}: `tinted`'s geometry (and any texture reference inside a
  // cloned material — THREE.Material.clone() shares textures, doesn't
  // deep-copy them) points back into the shared, cached `useGLTFScene` scene
  // graph. R3F auto-disposes a <primitive>'s resources on unmount by
  // default, which would otherwise permanently break that shared
  // geometry/texture for every OTHER consumer of the same named object the
  // moment any one instance unmounts (confirmed real bug via Hotel's
  // GLTFSceneObject-alike staircase preview, see docs/hotel-0c-specifikacio.md
  // §5.11.1) — never safe to skip for an object sourced from a shared cache.
  return <primitive object={tinted} scale={scale} dispose={null} />;
}
