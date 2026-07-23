import type { ComponentType } from 'react';

export interface GameDescriptor {
  id: string;
  label: string;
  load: () => Promise<{ default: ComponentType }>;
}

/**
 * Single source of truth for which games exist and how to code-split-load them.
 * Adding a new game means adding one entry here, nothing else in shell/.
 */
export const GAMES_REGISTRY: GameDescriptor[] = [
  { id: 'dama', label: 'Dáma', load: () => import('../games/dama') },
  { id: 'hotel', label: 'Hotel', load: () => import('../games/hotel') },
];
