/**
 * Player-facing rules summary — lásd docs/gazdalkodj-okosan-0a-specifikacio.md
 * a teljes, hiteles verzióért. Ez a ti Tesco-kiadásotok szabálya (eurós
 * valuta, saját szponzorkészlet), NEM a jelenlegi hivatalos forintos kiadás.
 */
export function GazdalkodjOkosanRules() {
  return (
    <>
      <h2>Gazdálkodj okosan! — szabályok</h2>
      <p>
        2–6 fő játszhatja. Mindenki 18.000 EUR készpénzzel indul a Start mezőről, és sorban dobva halad előre a pályán
        (mindig óramutató járása szerint). A cél: elsőként megszerezni egy teljesen kifizetett lakást, azt teljesen
        berendezni, megszerezni egy teljesen kifizetett autót az autóbiztosítással együtt — és eközben legalább 2.000
        EUR-t megtartani.
      </p>

      <h3>Pénz és bank</h3>
      <ul>
        <li>A készpénz és a folyószámla-egyenleg két külön összeg. Folyószámlát csak a 8-as (OTP Bank) mezőn lehet nyitni és arra befizetni; onnan viszont bármikor, bárhonnan ki lehet venni, és a számláról közvetlenül is lehet fizetni.</li>
        <li>A 8-as mezőn áthaladva vagy arra rálépve a folyószámla-egyenleg után 7% kamat jár.</li>
        <li>A Start mezőn áthaladva 2.000 EUR, arra rálépve 4.000 EUR jár.</li>
      </ul>

      <h3>Lakás és autó</h3>
      <ul>
        <li>Lakás a 19-es vagy 39-es mezőn vehető: 30.000 EUR készpénzért, vagy 35.000 EUR-ért hitelre (15.000 EUR előleg, a maradék 500 EUR-os részletekben).</li>
        <li>Autó (Citroën C4) az 5-ös mezőn vehető: 10.000 EUR készpénzért, vagy 15.000 EUR-ért hitelre (2.000 EUR előleg, a maradék 500 EUR-os részletekben).</li>
        <li>A hitel-részletek a Start mezőn DOBÁSSAL történő áthaladáskor/rálépéskor válnak esedékessé — ilyenkor a kör kötelező első lépéseként törleszteni kell, mielőtt bármi mást tehetnél.</li>
        <li>Bútor (összesen 6 tétel: konyhabútor, 4 Electrolux-készülék, szobabútor) csak akkor vásárolható, ha már van lakásod — mind a 6 kell a győzelemhez.</li>
      </ul>

      <h3>Biztosítás</h3>
      <p>A 9-es mezőn (Allianz Hungária) élet-, lakás- és autóbiztosítás köthető. A lakásbiztosítás tűzeset, az autóbiztosítás autólopás esetén nyújt védelmet egy-egy Szerencsekártya-hatás ellen.</p>

      <h3>Szerencsekerék</h3>
      <p>A Szerencsekerék-mezőkön (és a bérlethez kötött 27-es mezőn) kártyát kell húzni és követni az utasítását — pénznyeremény/veszteség, mezőváltás, bútornyeremény, vagy akár tűzeset/autólopás is lehet.</p>

      <h3>Egyéb mezők</h3>
      <ul>
        <li><strong>BKV-bérlet</strong> (2-es mező, 200 EUR): a 15-ös mező extra dobás jutalma és a 27-es mező kártyahúzása is csak bérlettel jár.</li>
        <li><strong>Kórház</strong> (13-as mező): csak 1-es vagy 6-os dobással léphetsz ki, a 3. próbálkozástól bármilyen dobással.</li>
        <li>Számos mező egyszerű, fix összegű fizetést ír elő (üzletek, szórakozás, számlák).</li>
      </ul>

      <h3>Csőd</h3>
      <p>Aki egy kötelező fizetést nem tud teljesíteni, azonnal kiesik a játékból — berendezési tárgyai visszaszállnak a bankra.</p>
    </>
  );
}

export default GazdalkodjOkosanRules;
