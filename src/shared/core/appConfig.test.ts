import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_CONFIG,
  deriveServerUrl,
  isGameEnabled,
  parseBasePath,
  parseEnabledGames,
  readAppConfig,
} from './appConfig';

describe('parseBasePath', () => {
  it('treats unset and blank values as a root deploy', () => {
    expect(parseBasePath(undefined)).toBe('/');
    expect(parseBasePath('  ')).toBe('/');
  });

  it('accepts sub-paths that start and end with a slash', () => {
    expect(parseBasePath('/')).toBe('/');
    expect(parseBasePath('/game-center/')).toBe('/game-center/');
    expect(parseBasePath('/a/b.c/')).toBe('/a/b.c/');
  });

  it.each(['game-center/', '/game-center', '/Game/', '/a//b/', '/a b/', '/"><script>/'])(
    'rejects %s',
    (value) => {
      expect(() => parseBasePath(value)).toThrow(/BASE_PATH/);
    },
  );
});

describe('parseEnabledGames / isGameEnabled', () => {
  it('means "all games" when unset or blank', () => {
    expect(parseEnabledGames(undefined)).toBeNull();
    expect(parseEnabledGames(' , ')).toBeNull();
  });

  it('splits and trims the list', () => {
    expect(parseEnabledGames('dama, hotel ,gwent')).toEqual(['dama', 'hotel', 'gwent']);
  });

  it('filters by the list, and lets everything through for null', () => {
    expect(isGameEnabled(null, 'anything')).toBe(true);
    expect(isGameEnabled(['dama'], 'dama')).toBe(true);
    expect(isGameEnabled(['dama'], 'hotel')).toBe(false);
  });
});

describe('readAppConfig', () => {
  it('returns the defaults for a missing or non-object value', () => {
    expect(readAppConfig(undefined)).toEqual(DEFAULT_APP_CONFIG);
    expect(readAppConfig('x')).toEqual(DEFAULT_APP_CONFIG);
  });

  it('accepts a well-formed config', () => {
    expect(readAppConfig({ basePath: '/game-center/', enabledGames: ['dama'] })).toEqual({
      basePath: '/game-center/',
      enabledGames: ['dama'],
    });
  });

  it('falls back per field on malformed values', () => {
    expect(readAppConfig({ basePath: 'nope', enabledGames: [1] })).toEqual(DEFAULT_APP_CONFIG);
  });
});

describe('deriveServerUrl', () => {
  it('appends the sub-path without a trailing slash', () => {
    expect(deriveServerUrl({ basePath: '/game-center/', enabledGames: null }, 'https://x.hu')).toBe(
      'https://x.hu/game-center',
    );
  });

  it('is just the origin for a root deploy', () => {
    expect(deriveServerUrl(DEFAULT_APP_CONFIG, 'https://x.hu')).toBe('https://x.hu');
  });
});
