import { useEffect, useState } from 'react';
import { GAMES_REGISTRY } from './gamesRegistry';

/**
 * Lazily loads the given game's theme class name (see `GameDescriptor.theme`
 * in gamesRegistry.ts) — `undefined` until it resolves, or if the game has
 * no `theme` entry at all. Callers append the returned class to their own
 * wrapper's `className`; the theme module's own CSS custom properties then
 * cascade to every descendant, CSS Modules scoping notwithstanding — the
 * same mechanism `clusterBTheme.module.css` already relies on (see
 * docs/b-klaszter-ui-specifikacio.md §3, docs/shell-ux-specifikacio.md §2).
 */
export function useGameTheme(gameId: string | undefined): string | undefined {
  const [themeClass, setThemeClass] = useState<string | undefined>(undefined);

  useEffect(() => {
    setThemeClass(undefined);
    const game = GAMES_REGISTRY.find((entry) => entry.id === gameId);
    if (!game?.theme) return;

    let cancelled = false;
    game.theme().then((module) => {
      if (!cancelled) setThemeClass(module.default);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  return themeClass;
}
