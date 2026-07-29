/**
 * Player-facing rules summary — edited down from the verbatim rules capture
 * in docs/hotel-0a-specifikacio.md §2 into a shorter, list-based form for
 * in-app reading (not design prose). Deliberately excludes the per-hotel
 * price tables — those are already shown, per-lot, in the purchase
 * confirmation modal (PlayerActionWheel.tsx's PurchaseConfirmModal).
 */
export function HotelRules() {
  return (
    <>
      <h2>Hotel — szabályok</h2>
      <p>2–4 fő játszik egy zárt, körbejárható pályán, dobókockával lépkedve. Nyolc névre szóló hotel várja a beépítést.</p>

      <h3>A mezők</h3>
      <ul>
        <li><strong>Start:</strong> itt nem történik semmi.</li>
        <li><strong>Vásárlás:</strong> a mező melletti üres telkeket megveheted. Ha egy telket már megvett valaki, de még nincs rajta épület, féláron elveheted tőle.</li>
        <li><strong>Építkezés:</strong> építhetsz a saját telkeidre — megadod, melyik telekre hány épületet szeretnél (csak sorban, kihagyás nélkül), majd az építési engedély-kockával dobsz. Egy körben többször is megismételhető.</li>
        <li><strong>Ingyen lépcső:</strong> lerakhatsz egy lépcsőt valamelyik hoteled mellé. Ha nincs hoteled, 100 pénzt kapsz; ha minden hoteled tele van lépcsővel, a legdrágább lépcsőd árát kapod meg.</li>
        <li><strong>Ingyen épület:</strong> ingyen felépíthetsz egy épületet valamelyik telkedre. Ha már minden kész, a legdrágább épület árát kapod meg; telek nélkül nem történik semmi.</li>
      </ul>

      <h3>Építési engedély</h3>
      <p>Az építkezés előtt dobnod kell a speciális engedély-kockával:</p>
      <ul>
        <li><strong>zöld</strong> (3 oldal): megépítheted, amit terveztél.</li>
        <li><strong>H</strong>: ingyen építhetsz.</li>
        <li><strong>2</strong>: dupla áron KELL megépítened.</li>
        <li><strong>piros</strong>: nem építhetsz — és ebben a körben újra sem próbálkozhatsz.</li>
      </ul>

      <h3>Lépcsők és éjszakák</h3>
      <p>Ha lépcsővel szomszédos mezőre lépsz, dobnod kell, hány éjszakát töltesz az adott hotelben — ez alapján fizetsz a tulajdonosnak. Két speciális sáv is van a pályán: az egyik átlépve 2000 pénzt ad, a másik abban a körben lépcső-vásárlási jogot ad minden birtokolt hotelre (körönként/hotelenként max. egyet).</p>

      <h3>Csőd, árverés, feladás</h3>
      <ul>
        <li>Ha nem tudsz fizetni, csődbe mész — a JÁTÉK emiatt nem ér véget.</li>
        <li>Csőd esetén elárverezheted egy hoteledet: a bank a felépítés költségének felét ajánlja, mások licitálhatnak feljebb.</li>
        <li>Feladás esetén minden hoteled a bankhoz kerül, mintha elárvereztél volna mindent.</li>
      </ul>

      <h3>Győzelem</h3>
      <p>Az nyer, aki utolsóként marad talpon.</p>
    </>
  );
}

export default HotelRules;
