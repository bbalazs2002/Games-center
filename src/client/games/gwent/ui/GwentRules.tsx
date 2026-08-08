/**
 * Player-facing rules summary — see docs/gwent-0a-specifikacio.md §2-4 for
 * the full, authoritative version this is edited down from. Deliberately
 * excludes the exhaustive per-leader ability list (20 vezér) and the exact
 * per-card copy limits — mindkettő már úgyis látszik a pakliépítőben/a
 * kiválasztott vezér-kártyán, nem kell itt megismételni (ugyanaz a elv, mint
 * a HotelRules kihagyja a hotelenkénti ártáblázatot).
 */
export function GwentRules() {
  return (
    <>
      <h2>Gwent — szabályok</h2>
      <p>2 fél csatázik, saját maga összeállított pakliból lerakott lapokkal — nem a szerencse, hanem a pakli és a taktika dönt. Egy meccs 3 kör, 2 győztes kör kell a végső győzelemhez.</p>

      <h3>Pakli és kezdés</h3>
      <ul>
        <li>Válassz frakciót (Northern Realms, Nilfgaardian Empire, Monsters, Scoia'tael) és egy hozzá tartozó vezért — mindkettő saját bónusszal/képességgel jár.</li>
        <li>A pakliban legalább 22 nem-Hős egységkártyának kell lennie, felfelé nincs korlát; minden lapból csak a rajta jelzett példányszám szerepelhet.</li>
        <li>Mindkét fél húz 10 lapot, majd legfeljebb 2-t lecserélhet újakra (mulligan).</li>
        <li>Az 1. kör kezdőjátékosát pénzfeldobás dönti el — kivéve, ha pontosan az egyik fél Scoia'tael: ekkor ő választja meg, ki kezdjen.</li>
      </ul>

      <h3>Egy kör menete</h3>
      <ul>
        <li>A felek felváltva lépnek: egy lapot lejátszanak, vagy passzolnak.</li>
        <li>Aki passzolt, onnantól a kör végéig nem léphet többet — a másik fél viszont még tehet le lapokat.</li>
        <li>A kör akkor ér véget, amikor mindkét fél passzolt.</li>
        <li>A kör azé, akinek a 3 során összesítve magasabb az erőpontszáma; döntetlennél mindkét fél veszít egy életet.</li>
      </ul>

      <h3>A sorok</h3>
      <p>Minden egységkártyának saját sora van — Közelharc, Távolsági vagy Ostrom —, csak oda tehető le. A kör végén a lapok (a Szörnyek frakció egy véletlenszerűen megtartott kártyája kivételével) a dobott lapok közé kerülnek — a kezedben maradó lapok viszont átmennek a következő körbe.</p>

      <h3>Speciális lapok</h3>
      <ul>
        <li><strong>Időjárás</strong> (Fagy/Köd/Eső): az érintett sortípuson MINDKÉT fél nem-Hős egységeinek erejét 1-re csökkenti, amíg valaki el nem takarítja. <strong>Tiszta idő</strong> egyszerre megszünteti az összes aktív időjárást.</li>
        <li><strong>Csel:</strong> egy már lerakott saját lapod helyére teszed — az a lap visszakerül a kezedbe.</li>
        <li><strong>Scorch:</strong> az egész táblán (mindkét oldalon, minden soron) elpusztítja a legerősebb egységet/egységeket.</li>
        <li><strong>Parancsnoki kürt:</strong> megduplázza az adott sor összes nem-Hős egységének erejét, amíg a sor lapokat tartalmaz.</li>
      </ul>

      <h3>Egység-képességek</h3>
      <ul>
        <li><strong>Kém:</strong> az ELLENFÉL oldalára kerül lerakáskor — cserébe azonnal húzol 2 lapot.</li>
        <li><strong>Orvos:</strong> lerakáskor visszahozhatsz egy lapot a saját dobott lapjaid közül a táblára.</li>
        <li><strong>Sereggyűjtés:</strong> lerakáskor a kezedből és a paklidból is automatikusan lerakja az összes vele egy csoportba tartozó lapot.</li>
        <li><strong>Szoros kötelék:</strong> minden azonos nevű, ugyanazon a soron álló társával duplázódik az ereje.</li>
        <li><strong>Lelkesítés:</strong> +1 erőt ad a sor összes MÁS kártyájának.</li>
        <li><strong>Hős:</strong> semmilyen hatás (időjárás, Scorch, Csel, Kürt) nem érinti — az ereje mindig fix.</li>
      </ul>

      <h3>Vezérek és frakció-bónuszok</h3>
      <p>Minden vezérnek saját, egyedi képessége van (egyszer aktiválható a meccs alatt, vagy végig passzívan hat) — a pontos leírás a kiválasztott vezér kártyáján olvasható. A frakciók emellett egy állandó bónusszal is járnak:</p>
      <ul>
        <li><strong>Northern Realms:</strong> minden megnyert kör után +1 lapot húz a saját paklijából.</li>
        <li><strong>Nilfgaardian Empire:</strong> egy döntetlenre végződő kört automatikusan megnyer.</li>
        <li><strong>Monsters:</strong> minden kör után 1 véletlenszerű egységkártyája a táblán marad (nem kerül a dobott lapok közé).</li>
        <li><strong>Scoia'tael:</strong> az 1. kör elején ez a játékos dönti el, ki kezd.</li>
      </ul>

      <h3>Győzelem</h3>
      <p>Mindkét fél 2 élettel indul, minden elvesztett kör (a döntetlen is) 1 életbe kerül. Aki előbb elveszíti mindkét életét, veszít — a meccset a másik fél nyeri.</p>
    </>
  );
}

export default GwentRules;
