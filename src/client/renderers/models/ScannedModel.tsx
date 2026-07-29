import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { cloneWithTint } from './materialTint';

export interface ScannedModelProps {
  /** Public-served .obj URL, e.g. "/assets/hotel/buildings/royal/model.obj". */
  objUrl: string;
  /** Public-served .mtl URL alongside the .obj, if the scan came with one. */
  mtlUrl?: string;
  /** Overrides every material's color on a per-instance clone — never mutates the cached loaded model. */
  colorTint?: string;
  /** Rendered while loading and if the model fails to load (e.g. not dropped in yet) — each caller supplies its own placeholder geometry. */
  fallback?: ReactNode;
  /** Overrides the model's own baked scale — omit to keep whatever scale the model was authored/exported with (the safe default: a model with a non-1 baked scale would otherwise silently get reset to 1x). */
  scale?: number;
}

function resourcePathOf(url: string): string {
  return url.slice(0, url.lastIndexOf('/') + 1);
}

async function loadObjModel(objUrl: string, mtlUrl?: string): Promise<THREE.Object3D> {
  const objLoader = new OBJLoader();
  if (mtlUrl) {
    const mtlLoader = new MTLLoader();
    mtlLoader.setResourcePath(resourcePathOf(mtlUrl));
    const materials = await mtlLoader.loadAsync(mtlUrl);
    materials.preload();
    objLoader.setMaterials(materials);
  }
  return objLoader.loadAsync(objUrl);
}

/** One in-flight/loaded promise per (objUrl, mtlUrl) pair — every instance of the same model (e.g. several buildings on one lot, or one car per player) shares a single fetch+parse. */
const modelCache = new Map<string, Promise<THREE.Object3D>>();

function cachedLoadObjModel(objUrl: string, mtlUrl?: string): Promise<THREE.Object3D> {
  const cacheKey = `${objUrl}|${mtlUrl ?? ''}`;
  const cached = modelCache.get(cacheKey);
  if (cached) return cached;
  const promise = loadObjModel(objUrl, mtlUrl);
  modelCache.set(cacheKey, promise);
  promise.catch(() => modelCache.delete(cacheKey)); // don't cache a failure — a model dropped in later should be picked up on the next mount
  return promise;
}

/**
 * Renders a real, phone-scanned OBJ+MTL model (see docs/hotel-0c-specifikacio.md)
 * once it exists at the given URL, falling back to caller-supplied placeholder
 * geometry until then — so a game can wire this in ahead of the actual model
 * files landing under public/, with zero code change needed once they do.
 * Game/renderer-agnostic on purpose: reusable by any future R3F-based
 * renderer, not just Hotel's loop-track board.
 */
export function ScannedModel({ objUrl, mtlUrl, colorTint, fallback = null, scale }: ScannedModelProps) {
  const [loaded, setLoaded] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    cachedLoadObjModel(objUrl, mtlUrl)
      .then((object) => {
        if (!cancelled) setLoaded(object);
      })
      .catch(() => {
        // Stays null -> fallback renders. Expected until the real model is dropped in.
      });
    return () => {
      cancelled = true;
    };
  }, [objUrl, mtlUrl]);

  const tinted = useMemo(() => (loaded ? cloneWithTint(loaded, colorTint) : null), [loaded, colorTint]);

  if (!tinted) return <>{fallback}</>;
  return <primitive object={tinted} scale={scale} />;
}
