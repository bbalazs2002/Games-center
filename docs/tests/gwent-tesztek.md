# Gwent — tesztek

Futtatás: `npm run test:gwent` (26 teszt, 3 fájl). Lásd [README.md](./README.md) az általános konvenciókért. Ez a réteg (Gwent-0a.1: kártya-katalógus + deck-építési szabályok) nem tartalmaz még parti-motort (reducer/state) — az Gwent-0a.2 feladata, akkor bővül ez a dokumentum. A `GwentSetupPage`/`CardGrid` UI-t élő böngészős (Playwright) smoke teszt ellenőrizte implementáció közben (frakció→vezér→deck-építés teljes folyam, localStorage-perzisztencia oldal-újratöltés után), a szokásos "motort tesztelünk, nem UI-t" elv szerint.

## `src/shared/games/gwent/engine/cardDefs.test.ts` (13 teszt)

A `scripts/build-gwent-assets.mjs` által generált statikus katalógus (`CARD_DEFS`, `temp/gwent-card-data.json`-ból) belső konzisztenciája.

- **Alapszámosság** — pontosan 134 bejegyzés (154 kutatott kártya mínusz a 20 vezér); egyedi `id`-k; minden `id` feloldható `getCardDef`-fel, ismeretlen `id`-ra dob; minden kártyának van legalább 1 `imagePath`-ja és pozitív `copies` értéke.
- **`row`/`basePower` konzisztencia** — csak `Unit`-kind kártyáknak van soruk/erejük; az Agile-képességű egységeknek SOSEM (a tényleges sor lejátszáskori választás, lásd 0a-spec §3.1) — ezt a tesztet a generátor egy valós adatbug-ja (Olgierd von Everec: a kutatási JSON `row: 'Melee'`-t adott az Agile képesség MELLÉ) buktatta le először, a `classifyRow` `abilities`-alapú (nem `row`-mező-alapú) normalizálással lett javítva.
- **`weatherRow`** — kizárólag `Weather`-kind kártyáknál nem null.
- **`rowScorch`** — pontosan a 3 névvel jelzett kártyánál (Schirrú, Toad, Villentretenmerth) nem null.
- **`mustersWithIds` szimmetria** — ha A musterel B-vel, B is musterel A-val; a Crone-csoport 3, a Vámpír-csoport 5 tagú, mindegyik a többi taggal.

## `src/shared/games/gwent/engine/leaderDefs.test.ts` (6 teszt)

A vezér-katalógus (`LEADER_DEFS`).

- Pontosan 20 bejegyzés, frakciónként pontosan 5 (Northern Realms/Nilfgaard/Monsters/Scoiatael — Skellige egyelőre kizárva); egyedi `id`-k, `getLeaderDef` felold/dob; minden vezérnek van magyar `abilityDescription`-je és legalább 1 képe.

## `src/shared/games/gwent/engine/deckRules.test.ts` (7 teszt)

`validateDeckDraft` — a pakli-építés hivatalos szabálya (0a-spec §2, web-forrásból megerősítve: legalább 22 NEM-Hero egységkártya, 1 illeszkedő frakciójú vezér, kártyánként a `copies` korlát, Neutral kártyák bármely frakcióhoz).

- Egy szabályos (22 nem-Hero egységkártyás, illeszkedő vezérrel rendelkező) pakli érvényes.
- 22-nél kevesebb nem-Hero egységkártya érvénytelen.
- Hero-kártyák NEM számítanak bele a 22-es minimumba (egy nem-Hero lapot Hero lapra cserélve érvénytelenné válik).
- Más frakciójú vezér érvénytelen.
- Más (nem Neutral) frakció kártyája érvénytelen.
- Egy kártya hivatalos példányszám-korlátjának túllépése érvénytelen.
- Neutral kártyák bármely frakció paklijában szabadok.
