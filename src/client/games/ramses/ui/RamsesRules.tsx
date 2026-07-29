/**
 * Player-facing rules summary for the IMPLEMENTED base game only — see
 * docs/ramses-0a-specifikacio.md §2.1-2.4. The special action cards (§2.5)
 * are planned but not yet built (several rule ambiguities still open), so
 * this text deliberately doesn't mention them — showing a rule nobody can
 * actually trigger in-game would be misleading, not helpful.
 */
export function RamsesRules() {
  return (
    <>
      <h2>Ramses — szabályok</h2>
      <p>Emlékező-kereső játék egy 6×8-as rácson — piramisok alatt rejtett kincsek, amiket egy 15-ös kirakóhoz hasonló csúsztatással deríthetsz fel.</p>

      <h3>A tábla</h3>
      <p>48 mezőből pontosan 47-en áll piramis, egy mindig üres. A piramisok alatt 12 mező rejt kincset, a többi üres — ez a réteg a parti elejétől a végéig nem változik.</p>

      <h3>Egy kör</h3>
      <ul>
        <li>Húzol egy lapot a húzópakliból — ez mutatja, melyik kincset keresed.</li>
        <li>Az üres mezővel szomszédos piramisok közül egyet az üres helyre csúsztatsz — ezzel felfeded a piramis eredeti helyét.</li>
        <li><strong>Üres mező:</strong> folytathatod, tetszőleges hosszú láncban csúsztathatsz tovább, amíg kincset nem találsz.</li>
        <li><strong>Rossz kincs:</strong> a köröd véget ér, a lap marad célként — a következő játékos ugyanazt a kincset keresi.</li>
        <li><strong>Jó kincs:</strong> megkapod a lapot, és — mivel nálunk ki tartja a keresést, míg nem hibázik — Te húzol tovább, a köröd folytatódik.</li>
      </ul>

      <h3>Vége és pontszámítás</h3>
      <ul>
        <li>A játék véget ér, amint elfogy az utolsó lap a húzópakliból.</li>
        <li>Mindenki összeadja a megnyert lapjai pontértékét — a legtöbb pont nyer.</li>
        <li>Pontegyenlőség esetén a legtöbb megnyert LAP dönt; ha ez is egyenlő, mindenki, aki holtversenyben áll, nyer.</li>
      </ul>
    </>
  );
}

export default RamsesRules;
