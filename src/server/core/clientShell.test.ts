import { describe, expect, it } from 'vitest';
import { renderIndexHtml } from './clientShell';

const TEMPLATE = '<!doctype html><html><head><meta charset="UTF-8" /></head><body></body></html>';

describe('renderIndexHtml', () => {
  it('injects the base element and the config script right after <head>', () => {
    const html = renderIndexHtml(TEMPLATE, { basePath: '/game-center/', enabledGames: ['dama'] });
    expect(html).toContain(
      '<head><base href="/game-center/"><script>window.__APP_CONFIG__={"basePath":"/game-center/","enabledGames":["dama"]};</script><meta',
    );
  });

  it('serializes "all games" as null', () => {
    const html = renderIndexHtml(TEMPLATE, { basePath: '/', enabledGames: null });
    expect(html).toContain('"enabledGames":null');
  });

  it('escapes "<" so a game id can never close the script element', () => {
    const html = renderIndexHtml(TEMPLATE, { basePath: '/', enabledGames: ['</script><b>'] });
    expect(html).not.toContain('</script><b>');
    expect(html).toContain('\\u003c/script>');
  });

  it('does not interpret "$" patterns in the injected text', () => {
    const html = renderIndexHtml(TEMPLATE, { basePath: '/', enabledGames: ['$&x'] });
    expect(html).toContain('"$&x"');
  });

  it('matches <head> case-insensitively and with attributes', () => {
    const html = renderIndexHtml('<HEAD lang="hu"></HEAD>', { basePath: '/', enabledGames: null });
    expect(html.startsWith('<HEAD lang="hu"><base href="/">')).toBe(true);
  });

  it('throws when there is no <head>', () => {
    expect(() => renderIndexHtml('<html></html>', { basePath: '/', enabledGames: null })).toThrow(
      /head/,
    );
  });
});
