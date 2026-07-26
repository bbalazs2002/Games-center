import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { cloneWithTint } from './materialTint';

export interface GLTFSceneObjectProps {
  /** Public-served .glb/.gltf URL — may contain many named objects (e.g. one Blender scene with all 8 hotels); every consumer of the same url shares one fetch+parse. */
  url: string;
  /** Name of the object/group inside the scene to render, exactly as authored in Blender (Outliner name). */
  objectName: string;
  /** Overrides every material's color on a per-instance clone — never mutates the cached loaded scene. */
  colorTint?: string;
  /** Rendered while loading and if the scene/object fails to load (wrong url, or the named object isn't in it yet). */
  fallback?: ReactNode;
  scale?: number;
}

/** One in-flight/loaded promise per scene URL — loading a combined multi-object .glb once and reusing it for every named object inside it (e.g. all 8 hotels from one file), not refetching per object. */
const sceneCache = new Map<string, Promise<THREE.Group>>();

function cachedLoadGLTFScene(url: string): Promise<THREE.Group> {
  const cached = sceneCache.get(url);
  if (cached) return cached;
  const promise = new GLTFLoader().loadAsync(url).then((gltf) => gltf.scene);
  sceneCache.set(url, promise);
  promise.catch(() => sceneCache.delete(url)); // don't cache a failure — a scene dropped in later should be picked up on the next mount
  return promise;
}

/**
 * Renders one named object out of a real, Blender-authored glTF/GLB scene
 * (see docs/hotel-0c-specifikacio.md §5.5) once it exists at the given URL,
 * falling back to caller-supplied placeholder geometry until then. Sibling
 * to ScannedModel (OBJ+MTL, single object per file) — this is for a combined
 * multi-object scene export instead, still renderer/game-agnostic.
 */
export function GLTFSceneObject({ url, objectName, colorTint, fallback = null, scale = 1 }: GLTFSceneObjectProps) {
  const [scene, setScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    let cancelled = false;
    setScene(null);
    cachedLoadGLTFScene(url)
      .then((loaded) => {
        if (!cancelled) setScene(loaded);
      })
      .catch(() => {
        // Stays null -> fallback renders. Expected until the real scene is dropped in.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const found = useMemo(() => (scene ? (scene.getObjectByName(objectName) ?? null) : null), [scene, objectName]);
  const tinted = useMemo(() => (found ? cloneWithTint(found, colorTint) : null), [found, colorTint]);

  if (!tinted) return <>{fallback}</>;
  return <primitive object={tinted} scale={scale} />;
}
