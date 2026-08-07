import { useEffect, useState } from 'react';
import { assetUrl } from '../../../../core/assetUrl';
import { getCardDef } from '@shared/games/gwent/engine/cardDefs';
import { BITING_FROST_CARD_ID, IMPENETRABLE_FOG_CARD_ID, TORRENTIAL_RAIN_CARD_ID } from '@shared/games/gwent/engine/specialCardIds';
import type { CardDef, Row } from '@shared/games/gwent/engine/types';
import { useCardFlight } from './useCardFlight';
import styles from './ActiveWeatherZone.module.css';

const WEATHER_CARD_ID_BY_ROW: Record<Row, string> = {
  Melee: BITING_FROST_CARD_ID,
  Ranged: IMPENETRABLE_FOG_CARD_ID,
  Siege: TORRENTIAL_RAIN_CARD_ID,
};

/**
 * How long the about-to-clear weather tiles stay mounted (with `.clearing`'s
 * fade/shrink CSS animation playing) after `activeWeatherRows` empties —
 * matched to `cardFlight.tsx`'s `EXIT_DURATION_MS`, the Clear Weather card's
 * own 2nd-leg (zone → discard) flight duration, so the tiles and the Clear
 * Weather card visually leave TOGETHER (felhasználói kérés, 2026-08-07: "a
 * tiszta idő kártya... a dobó pakliba a többivel együtt") without the two
 * needing to share one literal flight (no real `CardInstance` exists for an
 * active-weather-effect tile — only the affected row is tracked).
 */
const CLEARING_ANIMATION_MS = 480;

export interface ActiveWeatherZoneProps {
  activeWeatherRows: Row[];
  /** Opens the carousel inspector for the active weather cards as their own group (Gwent-0d §4) — a CATALOG group (no live CardInstance exists for an active weather effect, only the affected row is tracked). */
  onOpenGroup: (defs: CardDef[], initialIndex: number) => void;
}

/**
 * Gwent-0d §3, korrekció (2026-08-05) — a bal (vezér) oszlop szélességére
 * szűkítve, a két vezér-kártya KÖZÖTT, a sorok felé eső (jobb) szélhez
 * igazítva ("a kijátszott kártyák mellé") — nem egy önálló, teljes szélességű
 * sáv. A kör-számláló felirat innen törölve (felhasználói kérés).
 *
 * `weather-zone` (registerZoneRef): a repülő-rendszer landing/takeoff
 * horgonya egy lejátszott (nem Tiszta idő) Időjárás-lapnak (cardFlight.tsx's
 * `resolveExitZone`) ÉS a Tiszta idő lap saját 2-ütemű repülésének köztes
 * megállója (`spawnFloatThenDiscardFlight`) — lásd docs/gwent-0e-*.
 */
export function ActiveWeatherZone({ activeWeatherRows, onOpenGroup }: ActiveWeatherZoneProps) {
  const { registerZoneRef } = useCardFlight();
  const [displayedRows, setDisplayedRows] = useState<Row[]>(activeWeatherRows);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (activeWeatherRows.length > 0) {
      setDisplayedRows(activeWeatherRows);
      setClearing(false);
      return;
    }
    if (displayedRows.length === 0) return;
    setClearing(true);
    const timer = setTimeout(() => {
      setDisplayedRows([]);
      setClearing(false);
    }, CLEARING_ANIMATION_MS);
    return () => clearTimeout(timer);
    // Deliberately NOT keyed on `displayedRows` — only reacting to a REAL
    // `activeWeatherRows` change (the source of truth), never re-triggering
    // the clearing timer off its own derived state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWeatherRows]);

  const defs = displayedRows.map((row) => getCardDef(WEATHER_CARD_ID_BY_ROW[row]));

  return (
    <div ref={registerZoneRef('weather-zone')} className={[styles.zone, clearing && styles.clearing].filter(Boolean).join(' ')}>
      {defs.map((def, index) => (
        <button
          key={def.id}
          type="button"
          className={styles.weatherCard}
          onClick={() => onOpenGroup(defs, index)}
          disabled={clearing}
          title={def.name}
        >
          <img className={styles.weatherImage} src={assetUrl(def.imagePaths[0])} alt={def.name} />
        </button>
      ))}
    </div>
  );
}
