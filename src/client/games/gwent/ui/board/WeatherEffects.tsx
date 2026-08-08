import { useMemo, type CSSProperties, type JSX } from 'react';
import { assetUrl } from '../../../../core/assetUrl';
import type { Row } from '@shared/games/gwent/engine/types';
import styles from './WeatherEffects.module.css';

/**
 * Felhasználói kérés (2026-08-08): a soronkénti időjárás-réteg cseréje három
 * konkrét freefrontend.com referenciára — eső: "Pure CSS Random Rain with SVG
 * and CSS Variables" (jh3y, codepen.io/jh3y/pen/WyNdMG), hó/dér: "CSS
 * Snowfall Effect with Sass Generator" (darika-dev, codepen.io/darika-dev/pen/YPKyMgp,
 * kérésre fehér pelyhekkel az eredeti ❄️ emoji helyett), felhő: "SCSS Cloud"
 * (vavik96, codepen.io/vavik96/pen/vEdMXM, betűtípus nélkül, saját szerverről
 * kiszolgált képekkel — lásd public/assets/gwent/weather/). Mindhárom a
 * forrás GENERÁLÓ technikáját követi (sok elem, egyedi véletlen CSS-
 * változókkal), nem csak a végeredmény kinézetét — react-oldalon `useMemo`
 * gondoskodik róla, hogy a véletlen értékek csak egyszer, mountkor dőljenek
 * el, ne minden rendernél újrakeveredve villogjanak.
 */

const RAIN_DROP_COUNT = 36;
const SNOW_FLAKE_COUNT = 34;
/** A CodePen forrás clouds_2.png rétege (a hármas középső sávja) időközben eltűnt a CDN-jéről (403) — csak a másik két, ténylegesen elérhető réteg lett letöltve/self-hostolva. */
const CLOUD_LAYERS = [
  { src: assetUrl('/assets/gwent/weather/cloud-1.png'), width: 1000, durationS: 20 },
  { src: assetUrl('/assets/gwent/weather/cloud-3.png'), width: 1579, durationS: 17 },
];

/** Same teardrop outline as the jh3y reference pen, reused for every drop (only the CSS custom properties differ per instance). */
function RainDropShape() {
  return (
    <svg className={styles.dropSvg} viewBox="0 0 5 50" preserveAspectRatio="xMinYMin" aria-hidden="true">
      <path d="M 2.5,0 C 2.6949458,3.5392017 3.344765,20.524571 4.4494577,30.9559 5.7551357,42.666753 4.5915685,50 2.5,50 0.40843152,50 -0.75513565,42.666753 0.55054234,30.9559 1.655235,20.524571 2.3050542,3.5392017 2.5,0 Z" />
    </svg>
  );
}

function RainEffect() {
  const drops = useMemo(
    () =>
      Array.from({ length: RAIN_DROP_COUNT }, () => ({
        x: Math.random() * 100,
        o: Math.random() * 0.6 + 0.4,
        a: Math.random() * 0.5 + 0.55,
        d: Math.random() * -1.5,
        s: Math.random() * 0.6 + 0.7,
      })),
    [],
  );
  return (
    <div className={styles.rain} aria-hidden="true">
      {drops.map((drop, i) => (
        <span
          key={i}
          className={styles.drop}
          style={
            {
              '--x': drop.x,
              '--o': drop.o,
              '--a': drop.a,
              '--d': drop.d,
              '--s': drop.s,
            } as CSSProperties
          }
        >
          <RainDropShape />
        </span>
      ))}
    </div>
  );
}

function SnowEffect() {
  const flakes = useMemo(
    () =>
      Array.from({ length: SNOW_FLAKE_COUNT }, () => ({
        x: Math.random() * 100,
        size: Math.random() * 0.28 + 0.1,
        drift: Math.random() * 3 - 1.5,
        a: Math.random() * 4 + 4,
        d: Math.random() * -8,
        blurA: Math.random() * 2 + 1.5,
        blurD: Math.random() * -2,
      })),
    [],
  );
  return (
    <div className={styles.snow} aria-hidden="true">
      {flakes.map((flake, i) => (
        <span
          key={i}
          className={styles.flake}
          style={
            {
              '--x': flake.x,
              '--size': flake.size,
              '--drift': flake.drift,
              '--a': flake.a,
              '--d': flake.d,
              '--blur-a': flake.blurA,
              '--blur-d': flake.blurD,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function CloudEffect() {
  return (
    <div className={styles.clouds} aria-hidden="true">
      {CLOUD_LAYERS.map((layer, i) => (
        <div
          key={i}
          className={styles.cloudLayer}
          style={
            {
              backgroundImage: `url(${layer.src})`,
              '--cloud-width': `${layer.width}px`,
              '--cloud-duration': `${layer.durationS}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

const EFFECT_BY_ROW: Record<Row, () => JSX.Element> = {
  Melee: SnowEffect,
  Ranged: CloudEffect,
  Siege: RainEffect,
};

/**
 * Dispatches to the row-appropriate weather visual — see the module doc
 * comment for the source references. Deliberately renders NO positioning
 * wrapper of its own: `BoardRow` already wraps this in its own
 * `.weatherOverlay` div (matchBoard.module.css), which the sibling-exclusion
 * rule `.boardRow > *:not(.weatherOverlay)` specifically targets by that
 * SAME module's scoped class identity — a second, cross-module
 * `.weatherOverlay` here would be a different physical class after CSS
 * Modules scoping and would lose that exclusion (and the position:absolute
 * it needs) to matchBoard.module.css's higher-specificity `:not()` rule.
 */
export function WeatherOverlay({ row }: { row: Row }) {
  const Effect = EFFECT_BY_ROW[row];
  return <Effect />;
}
