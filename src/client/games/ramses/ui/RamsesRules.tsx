/**
 * Player-facing rules summary — see docs/ramses-0a-specifikacio.md §2.1-2.5/
 * §8.2 for the full, authoritative version. Special cards implemented
 * 2026-07-30 (previously omitted here while still unbuilt) — see §8.
 */
export function RamsesRules() {
  return (
    <>
      <h2>Ramses — szabályok</h2>
      <p>Emlékező-kereső játék egy 6×8-as rácson — piramisok alatt rejtett kincsek, amiket egy 15-ös kirakóhoz hasonló csúsztatással deríthetsz fel.</p>

      <h3>A tábla</h3>
      <p>48 mezőből pontosan 47-en áll piramis, egy mindig üres. A piramisok alatt 12 mező rejt kincset, a többi üres — ez a réteg a parti elejétől a végéig nem változik (a Homokvihar kivételével, lásd lent).</p>

      <h3>Egy kör</h3>
      <ul>
        <li>Húzol egy lapot a húzópakliból — ez mutatja, melyik kincset keresed (vagy egy speciális kártyát, lásd lent).</li>
        <li>Az üres mezővel szomszédos piramisok közül egyet az üres helyre csúsztatsz — ezzel felfeded a piramis eredeti helyét.</li>
        <li><strong>Üres mező:</strong> folytathatod, tetszőleges hosszú láncban csúsztathatsz tovább, amíg kincset nem találsz.</li>
        <li><strong>Rossz kincs:</strong> a köröd véget ér, a lap marad célként — a következő játékos ugyanazt a kincset keresi.</li>
        <li><strong>Jó kincs:</strong> megkapod a lapot, és — mivel nálunk ki tartja a keresést, míg nem hibázik — Te húzol tovább, a köröd folytatódik.</li>
      </ul>

      <h3>Speciális kártyák</h3>
      <p>Játék indítása előtt ki- és bekapcsolható. Bekapcsolva a 2-3. pakliban 6 speciális kártya is szerepel a sima kincs-kártyák mellett. Ezek (a Fata Morgana egyetlen kivétellel) azonnal lezárják annak a körét, aki kihúzta.</p>
      <ul>
        <li><strong>Homokvihar:</strong> a kincsréteg 180°-ban elfordul — minden mezőn, a már felfedetteken is.</li>
        <li>
          <strong>Ajándék:</strong> nevezz meg egy még rejtett kincset, és valódi csúsztatásokkal keresd meg. Siker esetén mindenki, akinek van ilyen kincsből
          lapja, a legkisebb pontértékűt neked adja. Ha nem sikerül, a következő játékos veszi át a kártyát, és ő nevez saját célt.
        </li>
        <li>
          <strong>Kockázat:</strong> nevezz meg 2 rejtett kincset, és keresd meg mindkettőt sorban. Siker esetén vakon húzhatsz egy lapot a bal oldali
          szomszédodtól. Ha egy harmadik kincs kerül elő, te adod a legkisebb pontértékű lapodat a bal szomszédnak.
        </li>
        <li>
          <strong>Sivatagi póker:</strong> nevezz meg egy rejtett kincset és egy másik játékost — neki kell megtalálnia. Siker esetén ő húz vakon tőled egy
          lapot; ha nem sikerül neki, te húzol vakon tőle.
        </li>
        <li>
          <strong>Fata Morgana:</strong> vakon húzol egy lapot a jobb oldali szomszédod lapjai közül, és meg kell találnod a kincsét. Siker esetén megtartod,
          ha nem, visszaadod. Ha a szomszédnak nincs lapja, a kártya hatástalan — a köröd folytatódik, húzhatsz újat.
        </li>
        <li><strong>Záró kártya:</strong> a játék azonnal véget ér, akárhány lap is maradt még a pakliban.</li>
      </ul>

      <h3>Vége és pontszámítás</h3>
      <ul>
        <li>A játék véget ér, amint elfogy az utolsó lap a húzópakliból (vagy valaki kihúzza a Záró kártyát).</li>
        <li>Mindenki összeadja a megnyert lapjai pontértékét — a legtöbb pont nyer.</li>
        <li>Pontegyenlőség esetén a legtöbb megnyert LAP dönt; ha ez is egyenlő, mindenki, aki holtversenyben áll, nyer.</li>
      </ul>
    </>
  );
}

export default RamsesRules;
