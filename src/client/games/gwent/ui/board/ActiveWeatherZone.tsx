import { assetUrl } from '../../../../core/assetUrl';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import { BITING_FROST_CARD_ID, IMPENETRABLE_FOG_CARD_ID, TORRENTIAL_RAIN_CARD_ID } from '../../../../../shared/games/gwent/engine/specialCardIds';
import type { CardDef, Row } from '../../../../../shared/games/gwent/engine/types';
import styles from './ActiveWeatherZone.module.css';

const WEATHER_CARD_ID_BY_ROW: Record<Row, string> = {
  Melee: BITING_FROST_CARD_ID,
  Ranged: IMPENETRABLE_FOG_CARD_ID,
  Siege: TORRENTIAL_RAIN_CARD_ID,
};

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
 */
export function ActiveWeatherZone({ activeWeatherRows, onOpenGroup }: ActiveWeatherZoneProps) {
  const defs = activeWeatherRows.map((row) => getCardDef(WEATHER_CARD_ID_BY_ROW[row]));

  return (
    <div className={styles.zone}>
      {defs.map((def, index) => (
        <button key={def.id} type="button" className={styles.weatherCard} onClick={() => onOpenGroup(defs, index)} title={def.name}>
          <img className={styles.weatherImage} src={assetUrl(def.imagePaths[0])} alt={def.name} />
        </button>
      ))}
    </div>
  );
}
