import type { ComponentType } from 'react';

export interface GameOnlineOptions {
  /** Whether "Új szoba" should offer a binary Ember/AI opponent choice — Dáma only (always exactly 2 players, so "AI or not" is the whole question). */
  supportsAiOpponent?: boolean;
  /** Whether "Új szoba" should offer an AI-opponent-count (0..playerCount-1) + difficulty picker instead — for games with a variable player count (2+), so "how many AI, how hard" replaces the binary choice. See docs/hotel-0d-ai-specifikacio.md §3.1, docs/ramses-0c-ai-specifikacio.md §6. */
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
  /**
   * CSS Modules class name (applied to a page's outermost wrapper) that puts
   * this game's own visual language — background, panel surface, accent —
   * onto a shell-level page that doesn't otherwise know which game it's
   * showing (Lobby, GameModeSelectPage, LoadingScreen). Lazily imported,
   * same code-splitting reasoning as `load` — a game's palette shouldn't
   * bloat every OTHER game's bundle. See docs/shell-ux-specifikacio.md §2.
   */
  theme?: () => Promise<{ default: string }>;
  /** Rules-modal content, lazily loaded the same way as `load`/`theme` — see docs/shell-ux-specifikacio.md §3. */
  rules?: () => Promise<{ default: ComponentType }>;
  /** Box-cover photo shown on HomePage's tile grid — see docs/shell-ux-specifikacio.md §5.2. Missing/omitted falls back to a monogram tile. */
  coverImage?: string;
}

/**
 * Single source of truth for which games exist and how to code-split-load them.
 * Adding a new game means adding one entry here, nothing else in shell/.
 */
export const GAMES_REGISTRY: GameDescriptor[] = [
  {
    id: 'dama',
    label: 'Dáma',
    load: () => import('../games/dama'),
    online: { supportsAiOpponent: true },
    theme: () => import('../renderers/grid-2d/clusterBTheme.module.css').then((m) => ({ default: m.default.theme })),
    rules: () => import('../games/dama/ui/DamaRules'),
  },
  {
    id: 'hotel',
    label: 'Hotel',
    load: () => import('../games/hotel'),
    online: { playerCountRange: [2, 4], supportsAiOpponentCount: true },
    theme: () => import('../games/hotel/ui/hotelTheme.module.css').then((m) => ({ default: m.default.theme })),
    rules: () => import('../games/hotel/ui/HotelRules'),
  },
  {
    id: 'ramses',
    label: 'Ramses',
    load: () => import('../games/ramses'),
    online: { playerCountRange: [2, 5], supportsAiOpponentCount: true },
    theme: () => import('../games/ramses/ui/ramsesTheme.module.css').then((m) => ({ default: m.default.theme })),
    rules: () => import('../games/ramses/ui/RamsesRules'),
  },
];
