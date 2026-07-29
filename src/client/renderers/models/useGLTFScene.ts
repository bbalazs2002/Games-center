import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** One in-flight/loaded promise per scene URL — a combined multi-object .glb (e.g. all 8 hotels) is loaded/parsed once and reused by every consumer that needs it. */
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
 * Loads (and caches, by URL) a full glTF/GLB scene — the shared primitive
 * behind `GLTFSceneObject` (per-name extraction of ONE object) and any
 * renderer that needs direct access to the whole scene graph at once (e.g.
 * reading several objects' baked positions together, see
 * `useHotelSpacePositions`). Returns null until loaded (or if loading fails).
 */
export function useGLTFScene(url: string): THREE.Group | null {
  const [scene, setScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    let cancelled = false;
    setScene(null);
    cachedLoadGLTFScene(url)
      .then((loaded) => {
        if (!cancelled) setScene(loaded);
      })
      .catch(() => {
        // Stays null -> caller's fallback path applies. Expected until the real scene is dropped in.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return scene;
}
