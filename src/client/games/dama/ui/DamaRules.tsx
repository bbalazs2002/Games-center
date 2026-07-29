/**
 * Player-facing rules summary for the implemented ruleset — nemzetközi/klasszikus
 * dáma (8×8, kötelező ütés, láncütés, "repülő" király) — see rules.ts for the
 * exact behavior this text describes (findCaptureMoves/findKingCaptureMovesInDirection).
 */
export function DamaRules() {
  return (
    <>
      <h2>Dáma — szabályok</h2>
      <p>Klasszikus, nemzetközi szabályok szerinti dáma, 8×8-as táblán, két oldal (világos/sötét) között.</p>

      <h3>Lépés</h3>
      <ul>
        <li>A közönséges bábu (dara) csak előre, átlósan léphet, egy mezőt.</li>
        <li>A király bármeddig léphet átlósan, bármelyik irányba, amíg üres mezőt talál.</li>
      </ul>

      <h3>Ütés</h3>
      <ul>
        <li>Az ütés MINDIG kötelező — ha van legalább egy ütési lehetőséged, sima lépést nem tehetsz.</li>
        <li>A közönséges bábu bármelyik átlós irányban üthet (nem csak előre), ha a szomszédos mezőn ellenfél áll, és a mögötte lévő mező üres.</li>
        <li>A király tetszőleges távolságról üthet egy átlós vonalon álló ellenfelet, ha utána legalább egy üres mező van, ahova landolhat.</li>
        <li>Ha ütés után a bábu folytathatja az ütést (láncütés), ugyanazzal a bábuval tovább kell ütnöd, amíg lehet.</li>
      </ul>

      <h3>Királlyá válás</h3>
      <p>Ha egy közönséges bábu eléri a tábla túlsó szélső sorát, azonnal királlyá válik — akár egy láncütés közepén is, ha ott ér célba.</p>

      <h3>Győzelem</h3>
      <p>Az nyer, akinek az ellenfele elveszíti minden bábuját, vagy nem tud lépni.</p>
    </>
  );
}

export default DamaRules;
