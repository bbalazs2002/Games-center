# Gwent — tesztek

Futtatás: `npm run test:gwent` (31 teszt, 3 fájl). Lásd [README.md](./README.md) az általános konvenciókért. Ez a réteg (Gwent-0a.1: kártya-katalógus + deck-építési szabályok) nem tartalmaz még parti-motort (reducer/state) — az Gwent-0a.2 feladata, akkor bővül ez a dokumentum. A `GwentSetupPage`/`CardGrid` UI-t élő böngészős (Playwright) smoke teszt ellenőrizte implementáció közben (frakció→vezér→deck-építés teljes folyam, localStorage-perzisztencia oldal-újratöltés után; 2026-08-01: playtest-javítási kör — nagyító-modál, rendezés, count/copies badge, frakció/vezér-váltás adatmegőrzéssel; ugyanaznap: a nagyító-modál eredeti angol kártyaszöveg-mezője), a szokásos "motort tesztelünk, nem UI-t" elv szerint.

## `src/shared/games/gwent/engine/cardDefs.test.ts` (17 teszt)

A `scripts/build-gwent-assets.mjs` által generált statikus katalógus (`CARD_DEFS`, `temp/gwent-card-data.json`-ból) belső konzisztenciája.

- **Alapszámosság** — pontosan 134 bejegyzés (154 kutatott kártya mínusz a 20 vezér); egyedi `id`-k; minden `id` feloldható `getCardDef`-fel, ismeretlen `id`-ra dob; minden kártyának van legalább 1 `imagePath`-ja és pozitív `copies` értéke.
- **`row`/`basePower` konzisztencia** — csak `Unit`-kind kártyáknak van soruk/erejük; az Agile-képességű egységeknek SOSEM (a tényleges sor lejátszáskori választás, lásd 0a-spec §3.1) — ezt a tesztet a generátor egy valós adatbug-ja (Olgierd von Everec: a kutatási JSON `row: 'Melee'`-t adott az Agile képesség MELLÉ) buktatta le először, a `classifyRow` `abilities`-alapú (nem `row`-mező-alapú) normalizálással lett javítva.
- **`weatherRow`** — kizárólag `Weather`-kind kártyáknál nem null.
- **`rowScorch`** — pontosan a 3 névvel jelzett kártyánál (Schirrú, Toad, Villentretenmerth) nem null.
- **`specialText`** (2026-08-01) — pontosan Cow-nál és Dandelion-nál nem null (a kártya-egyedi mechanikák magyar leírása, lásd 0a-spec §9.6).
- **Ice Giant ereje** (2026-08-01) — regressziós teszt a felhasználó által 2026-08-01-én javított 5→6 hibára.
- **Villentretenmerth NEM Hero** (2026-08-01) — regressziós teszt a felhasználó által javított, a wiki forrás által is megerősített hibára (0a-spec §9.7).
- **`cardText`** (2026-08-01) — minden `CardDef`-nek van nem-null, kutatással sourcolt eredeti angol szövege (0a-spec §9.7).
- **`mustersWithIds` szimmetria** — ha A musterel B-vel, B is musterel A-val; a Crone-csoport 3, a Vámpír-csoport 5 tagú, mindegyik a többi taggal.

## `src/shared/games/gwent/engine/leaderDefs.test.ts` (7 teszt)

A vezér-katalógus (`LEADER_DEFS`).

- Pontosan 20 bejegyzés, frakciónként pontosan 5 (Northern Realms/Nilfgaard/Monsters/Scoiatael — Skellige egyelőre kizárva); egyedi `id`-k, `getLeaderDef` felold/dob; minden vezérnek van magyar `abilityDescription`-je és legalább 1 képe; minden vezérnek van nem-null `cardText`-je (2026-08-01, eredeti angol szöveg).

## `src/shared/games/gwent/engine/deckRules.test.ts` (7 teszt)

`validateDeckDraft` — a pakli-építés hivatalos szabálya (0a-spec §2, web-forrásból megerősítve: legalább 22 NEM-Hero egységkártya, 1 illeszkedő frakciójú vezér, kártyánként a `copies` korlát, Neutral kártyák bármely frakcióhoz).

- Egy szabályos (22 nem-Hero egységkártyás, illeszkedő vezérrel rendelkező) pakli érvényes.
- 22-nél kevesebb nem-Hero egységkártya érvénytelen.
- Hero-kártyák NEM számítanak bele a 22-es minimumba (egy nem-Hero lapot Hero lapra cserélve érvénytelenné válik).
- Más frakciójú vezér érvénytelen.
- Más (nem Neutral) frakció kártyája érvénytelen.
- Egy kártya hivatalos példányszám-korlátjának túllépése érvénytelen.
- Neutral kártyák bármely frakció paklijában szabadok.
