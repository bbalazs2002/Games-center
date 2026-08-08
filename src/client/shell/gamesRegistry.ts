import type { ComponentType } from 'react';
import { assetUrl } from '../core/assetUrl';

export interface GameOnlineOptions {
  /** Whether "Új szoba" should offer a binary Ember/AI opponent choice — Dáma only (always exactly 2 players, so "AI or not" is the whole question). */
  supportsAiOpponent?: boolean;
  /** Whether "Új szoba" should offer an AI-opponent-count (0..playerCount-1) + difficulty picker instead — for games with a variable player count (2+), so "how many AI, how hard" replaces the binary choice. See docs/hotel-0d-ai-specifikacio.md §3.1, docs/ramses-0c-ai-specifikacio.md §6. */
  supportsAiOpponentCount?: boolean;
  /** [min, max] — when set, "Új szoba" offers a player-count picker instead of assuming a fixed 2. */
  playerCountRange?: [min: number, max: number];
  /** Ramses-only — whether "Új szoba" offers the speciális kártyák ki/bekapcsolása checkbox. See docs/ramses-0a-specifikacio.md §8.3. */
  supportsSpecialCardsToggle?: boolean;
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
  /**
   * Looping ambient background video for this game's non-gameplay shell
   * pages (Lobby, GameModeSelectPage, setup/room pages, LoadingScreen,
   * OnlineStatusScreen) — rendered by `<GameBackgroundVideo gameId=.../>`.
   * Deliberately NOT wired into the actual game-board pages (HotelGamePage/
   * HotelOnlineGamePage still only use `theme` for colors) — the user asked
   * for the video on Hotel-related pages but explicitly not during a match.
   */
  backgroundVideo?: string;
}

/**
 * Single source of truth for which games exist and how to code-split-load them.
 * Adding a new game means adding one entry here, nothing else in shell/.
 */
const ALL_GAMES: GameDescriptor[] = [
  {
    id: 'dama',
    label: 'Dáma',
    load: () => import('../games/dama'),
    online: { supportsAiOpponent: true },
    theme: () => import('../renderers/grid-2d/clusterBTheme.module.css').then((m) => ({ default: m.default.theme })),
    rules: () => import('../games/dama/ui/DamaRules'),
    coverImage: assetUrl('/assets/dama/box.jpg'),
  },
  {
    id: 'hotel',
    label: 'Hotel',
    load: () => import('../games/hotel'),
    online: { playerCountRange: [2, 4], supportsAiOpponentCount: true },
    theme: () => import('../games/hotel/ui/hotelTheme.module.css').then((m) => ({ default: m.default.theme })),
    rules: () => import('../games/hotel/ui/HotelRules'),
    coverImage: assetUrl('/assets/hotel/box.jpg'),
    backgroundVideo: assetUrl('/assets/hotel/background-video.mp4'),
  },
  {
    id: 'ramses',
    label: 'Ramses',
    load: () => import('../games/ramses'),
    online: { playerCountRange: [2, 5], supportsAiOpponentCount: true, supportsSpecialCardsToggle: true },
    theme: () => import('../games/ramses/ui/ramsesTheme.module.css').then((m) => ({ default: m.default.theme })),
    rules: () => import('../games/ramses/ui/RamsesRules'),
    coverImage: assetUrl('/assets/ramses/box.jpg'),
  },
  {
    id: 'gwent',
    label: 'Gwent',
    load: () => import('../games/gwent'),
    // Fixed 2-player — Dáma's binary Ember/AI pattern, not Hotel/Ramses's
    // N-fős stepper (see docs/gwent-0e-ai-specifikacio.md §9, implemented 2026-08-07).
    online: { supportsAiOpponent: true },
    theme: () => import('../games/gwent/ui/gwentTheme.module.css').then((m) => ({ default: m.default.theme })),
    rules: () => import('../games/gwent/ui/GwentRules'),
    coverImage: assetUrl('/assets/gwent/icons/box.png'),
  },
];

/**
 * Production deploys expose only the games that are actually beta-ready
 * (e.g. `ENABLED_GAMES=dama,hotel` — see docs/deployment-specifikacio.md §4)
 * via a comma-separated, build-time `VITE_ENABLED_GAMES` (bridged from the
 * plain `ENABLED_GAMES` env var by `vite.config.ts`, so both the client and
 * the server read the same single source of truth without duplicating the
 * value under two different names). Unset/empty — the default for local dev
 * and CI — means every game is enabled, so `npm run dev`/`vitest` behavior
 * never changes unless a deploy explicitly opts into restricting it.
 */
function filterEnabledGames(games: GameDescriptor[]): GameDescriptor[] {
  const raw: string = import.meta.env.VITE_ENABLED_GAMES;
  if (!raw) return games;
  const enabledIds = new Set(
    raw
      .split(',')
      .map((id: string) => id.trim())
      .filter(Boolean),
  );
  return games.filter((game) => enabledIds.has(game.id));
}

export const GAMES_REGISTRY: GameDescriptor[] = filterEnabledGames(ALL_GAMES);
