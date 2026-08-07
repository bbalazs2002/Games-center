import type { HotelLot } from '@shared/games/hotel/engine/state';
import { computeLotPurchasePrice } from '@shared/games/hotel/engine/rules';
import { propertyCardUrl } from './hotelModelAssets';
import styles from './HotelLotFacts.module.css';

/**
 * Full reference data for one hotel lot — both real property-card photos AND
 * the same numbers as plain, readable text/tables (telek/lépcső ára, minden
 * építkezési ár, éjszaka-árak táblázatban). Originally built only for
 * `PurchaseConfirmModal` (see PlayerActionWheel.tsx), then requested a
 * second time (2026-07-29 playtest) for `OwnedLotsPanel`'s own lot-preview
 * modal — "úgy, ahogy hotel vásárlásnál is" — so it's extracted here rather
 * than duplicated, same established pattern as this codebase's other
 * shared-component extractions.
 */
export function HotelLotFacts({ lot }: { lot: HotelLot }) {
  return (
    <>
      <div className={styles.cardImages}>
        <img src={propertyCardUrl(lot.id, 'const')} alt="Építési árak" />
        <img src={propertyCardUrl(lot.id, 'nights')} alt="Éjszaka-árak" />
      </div>
      <dl className={styles.facts}>
        <dt>Telek ára</dt>
        <dd>{computeLotPurchasePrice(lot)}</dd>
        <dt>Lépcső ára</dt>
        <dd>{lot.staircasePrice}</dd>
      </dl>
      <h3>Építkezés költsége</h3>
      <ul className={styles.buildList}>
        {lot.buildingPrices.map((price, index) => (
          <li key={index}>
            {index + 1}. épület: {price}
          </li>
        ))}
        <li>Kert: {lot.gardenPrice}</li>
      </ul>
      <h3>Éjszakák ára</h3>
      <div className={styles.nightsTableWrap}>
        <table className={styles.nightsTable}>
          <thead>
            <tr>
              <th>Épület</th>
              {lot.nightlyRates[0].map((_, nightIndex) => (
                <th key={nightIndex}>{nightIndex + 1} éj</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lot.nightlyRates.map((row, tierIndex) => (
              <tr key={tierIndex}>
                <th>{tierIndex + 1}.</th>
                {row.map((price, nightIndex) => (
                  <td key={nightIndex}>{price}</td>
                ))}
              </tr>
            ))}
            <tr>
              <th>+kert</th>
              {lot.gardenNightlyRates.map((price, nightIndex) => (
                <td key={nightIndex}>{price}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
