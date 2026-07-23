import type { ComponentType } from 'react';

export interface GameOnlineOptions {
  /** Whether "Új szoba" should offer an Ember/AI opponent choice — Dáma only for now (Hotel-0d adds this for Hotel). */
  supportsAiOpponent?: boolean;
  /** [min, max] — when set, "Új szoba" offers a player-count picker instead of assuming a fixed 2. */
  playerCountRange?: [min: number, max: number];
}

export interface GameDescriptor {
  id: string;
  label: string;
  load: () => Promise<{ default: ComponentType }>;
  /** Which room-creation options LobbyPage's "Új szoba" modal should offer for this game — omitted means "none of these," not "unsupported." */
  online?: GameOnlineOptions;
}

/**
 * Single source of truth for which games exist and how to code-split-load them.
 * Adding a new game means adding one entry here, nothing else in shell/.
 */
export const GAMES_REGISTRY: GameDescriptor[] = [
  { id: 'dama', label: 'Dáma', load: () => import('../games/dama'), online: { supportsAiOpponent: true } },
  { id: 'hotel', label: 'Hotel', load: () => import('../games/hotel'), online: { playerCountRange: [2, 4] } },
];
