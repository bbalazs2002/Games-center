import type { ComponentType } from 'react';

export interface GameOnlineOptions {
  /** Whether "Új szoba" should offer a binary Ember/AI opponent choice — Dáma only (always exactly 2 players, so "AI or not" is the whole question). */
  supportsAiOpponent?: boolean;
  /** Whether "Új szoba" should offer an AI-opponent-count (0..playerCount-1) + difficulty picker instead — Hotel only (2-4 players, so "how many AI, how hard" replaces the binary choice). See docs/hotel-0d-ai-specifikacio.md §3.1. */
  supportsAiOpponentCount?: boolean;
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
  {
    id: 'hotel',
    label: 'Hotel',
    load: () => import('../games/hotel'),
    online: { playerCountRange: [2, 4], supportsAiOpponentCount: true },
  },
  {
    id: 'ramses',
    label: 'Ramses',
    load: () => import('../games/ramses'),
    online: { playerCountRange: [2, 5] },
  },
];
