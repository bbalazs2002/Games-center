import type { AppConfig } from '@shared/core/appConfig';

const HEAD_OPEN_TAG = /<head[^>]*>/i;

/**
 * Injects the runtime config into the built `index.html` (see
 * docs/installer-kompatibilitas-specifikacio.md §3.1): a `<base href>` so the build's relative
 * asset URLs resolve under the sub-path (deep links included), plus the inline script the client's
 * `appConfig.ts` reads. Both go first in `<head>`, so they exist before any module script runs.
 *
 * `config.basePath` is validated upstream (`parseBasePath`), which is what makes it safe inside
 * the attribute; the JSON gets `<` escaped so a value can never close the script element.
 */
export function renderIndexHtml(template: string, config: AppConfig): string {
  if (!HEAD_OPEN_TAG.test(template)) {
    throw new Error('Az index.html-ben nincs <head> elem, a konfiguráció nem szúrható be.');
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  const injection = `<base href="${config.basePath}"><script>window.__APP_CONFIG__=${json};</script>`;
  // A replacer function, not a string: the injection must never be scanned for `$&`-style patterns.
  return template.replace(HEAD_OPEN_TAG, (openTag) => `${openTag}${injection}`);
}
