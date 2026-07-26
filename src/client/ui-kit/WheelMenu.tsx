import type { ReactNode } from 'react';
import styles from './WheelMenu.module.css';

export interface WheelMenuSlice {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
}

export interface WheelMenuProps {
  slices: WheelMenuSlice[];
  /** Shown in the hub alongside the close button — hidden when there's nowhere to go back to. */
  onBack?: () => void;
  onClose: () => void;
}

const OUTER_RADIUS = 140;
const INNER_RADIUS = 54;
const CENTER = 150;

function polarToCartesian(radius: number, angleDeg: number): { x: number; y: number } {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(angleRad), y: CENTER + radius * Math.sin(angleRad) };
}

/** One donut-slice path, clockwise from startAngle to endAngle (both in degrees, 0 = 12 o'clock). */
function wedgePath(startAngle: number, endAngle: number): string {
  // A full 360° sweep can't be drawn as a single SVG arc (start/end points
  // coincide, producing a degenerate/invisible path) — this only bites the
  // single-slice case, so shave a hair off the sweep there.
  const clampedEnd = Math.min(endAngle, startAngle + 359.99);
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0;
  const outerStart = polarToCartesian(OUTER_RADIUS, startAngle);
  const outerEnd = polarToCartesian(OUTER_RADIUS, clampedEnd);
  const innerEnd = polarToCartesian(INNER_RADIUS, clampedEnd);
  const innerStart = polarToCartesian(INNER_RADIUS, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

/**
 * A circular dial, divided into as many pie/donut slices as there are
 * options — unusable options still render (grayed out, unclickable), so the
 * dial's shape stays predictable turn to turn. The hub (the hole in the
 * donut) always holds Close, and Back when there's a previous menu level —
 * see docs/hotel-0a-specifikacio.md §5/§9 and assets/Hotel/UI-menu.png for
 * the requested look. Game-agnostic — belongs in ui-kit like Menu/Modal.
 */
export function WheelMenu({ slices, onBack, onClose }: WheelMenuProps) {
  const sliceAngle = 360 / slices.length;

  return (
    <div className={styles.wheel}>
      <div className={styles.glassBackdrop} />
      <svg viewBox="0 0 300 300" className={styles.svg}>
        {slices.map((slice, index) => {
          const startAngle = index * sliceAngle;
          const endAngle = startAngle + sliceAngle;
          const midAngle = (startAngle + endAngle) / 2;
          const labelPoint = polarToCartesian((OUTER_RADIUS + INNER_RADIUS) / 2, midAngle);
          const iconPoint = polarToCartesian((OUTER_RADIUS + INNER_RADIUS) / 2, midAngle - sliceAngle / 6);
          return (
            <g
              key={slice.id}
              className={slice.disabled ? styles.sliceDisabled : styles.slice}
              onClick={slice.disabled ? undefined : slice.onSelect}
            >
              <path d={wedgePath(startAngle, endAngle)} />
              <foreignObject x={iconPoint.x - 11} y={iconPoint.y - 20} width={22} height={22}>
                <div className={styles.icon}>{slice.icon}</div>
              </foreignObject>
              <text x={labelPoint.x} y={labelPoint.y + 14} className={styles.label} textAnchor="middle">
                {slice.label}
              </text>
            </g>
          );
        })}
        <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS - 2} className={styles.hub} onClick={onClose} />
      </svg>
      <div className={styles.hubButtons}>
        {onBack && (
          <button className={styles.backButton} onClick={onBack}>
            Vissza
          </button>
        )}
        <button className={styles.closeButton} onClick={onClose} aria-label="Bezárás">
          ×
        </button>
      </div>
    </div>
  );
}
