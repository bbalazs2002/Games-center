import type { CardInstance } from '@shared/games/gwent/engine/state';

/**
 * Deterministic art-variant pick (spec §5.2) — same instanceId always renders
 * the same variant within one session. Split out of `CardTile.tsx` so that
 * file only exports the component itself (a plain function export alongside
 * it defeats Vite Fast Refresh for the whole file).
 */
export function pickVariant(instance: CardInstance, imagePaths: string[]): string {
  if (imagePaths.length <= 1) return imagePaths[0];
  let hash = 0;
  for (let i = 0; i < instance.instanceId.length; i += 1) hash = (hash * 31 + instance.instanceId.charCodeAt(i)) >>> 0;
  return imagePaths[hash % imagePaths.length];
}
