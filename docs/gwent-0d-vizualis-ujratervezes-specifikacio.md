# Gwent-0d — teljes vizuális újratervezés a Witcher 3-beli Gwent minijáték alapján

**Státusz (2026-08-07): 0–5. fázis KÉSZ, élőben ellenőrizve (tsc/eslint/tesztek/build zöld).**

- 0. fázis (asset-pipeline, betűtípusok, alap-tokenek) — kész.
- 1. fázis (`CardTile` egyszerűsítés) — kész.
- 2. fázis (`CardCarouselModal`) — kész.
- 3. fázis (meccs-tábla) — kész; több élő korrekciós kör után (időjárás-sáv/vezér-gomb átfedés, ezüst margó folytonossága, arany elválasztó szélessége, húzópakli-hely, jobb oldali margó a sínig, ellenfél-oldali vezér-gomb elrejtése) a felhasználó jóváhagyta a végleges állapotot referenciapontként (`git tag gwent-0d-phase3-checkpoint`).
- 4. fázis (pakli-építő két hasábos átépítése) — kész, plusz több utólagos finomhangolási kör: nagyobb kártyaképek 3/soros elrendezésben, önálló görgetésű hasábok, "Nézegető mód" bevezetése (a külön "i" infógomb később teljesen megszűnt), a vezér csak a nagy kártyaként jelenik meg (karuszel-modálos váltással), Pakli mentése/Tovább gombok a középső oszlop aljára költöztek, majd az erő-szám és a sor-jelölés (végül ikon, nem felirat) nagyobbra és jobban olvashatóra állítva a Gyűjtemény/Pakliban csempéken. A már ezáltal feleslegessé vált `CardGrid`/`CardCountGrid`/`LeaderStep.tsx` törölve.
- 5. fázis (maradék képernyők token-szintű igazítása) — kész: a token-rendszer (`gwentTheme.module.css`, Cinzel/EB Garamond) és a `CardCarouselModal` már a korábbi fázisokban be volt kötve ezekbe a képernyőkbe is (`MulliganScreen`, `RoundSummaryModal`, `GwentLogPanel`, a győzelmi képernyő — mind faragott fa- vagy pergamen-panelben ültek már). Az egyetlen valódi hiányosság a `StartingChoiceScreen`/`PassDeviceScreen` volt: puszta szöveg a sötét háttéren, semmilyen kártya-keret nélkül — most egy közös `.screenPanel` (faragott fa-doboz, `.actionBar`/`.setupPanel` mintájára) veszi körül a tartalmukat, konzisztensen a játék többi felületével.

## Kontextus

Az öt korábbi finomhangolási kör (0c–0c.4) ellenére a felület nem adja vissza az eredeti Gwent hangulatát — inkrementális foltozásokból állt össze, nem tudatos vizuális tervből (ld. `docs/gwent-0c-vizualis-osszefoglalo.md`). A felhasználó az `assets/Gwent/design-sample/` mappába képernyőképeket tett a **Witcher 3-ban található Gwent minijátékból** (NEM a különálló CDPR standalone kliensből — a képeken látható Geralt-portré, "Forfeit Game"/kontroller-gomb feliratok ezt igazolják), plusz nyers textúra-fájlokat — és arra kért, hogy ezt másoljuk le **minél pontosabban**, nulláról építve újra a stílust.

**Kulcsfontosságú felfedezés a kutatás közben**: a projekt kártya-képei (`assets/Gwent/cards/**/*.png`, feldolgozva `public/assets/gwent/cards/`-ba) és vezér-képei (`public/assets/gwent/leaders/*.jpg`) MÁR TARTALMAZZÁK a teljes hivatalos kártya-kinézetet beégetve: kör alakú erő-jelvény, képesség-ikon jelvény, átlós frakció-szalag embléммal, krém pergamen névtábla, flavor-idézet — pontosan úgy, ahogy a referencia-képeken látszik (ellenőrizve: `Ballista 1.png`, `Biting Frost 1.png`, egy Eredin vezér-kép). **Ez azt jelenti, hogy a kártya-komponensnek NEM kell CSS-sel újraépítenie a szalagot/névtáblát/jelvényeket — csak a MEGLÉVŐ képet kell megfelelően megjelenítenie**, ami drasztikusan leegyszerűsíti a kártya-szintű munkát a korábban feltételezetthez képest.

## A felhasználó pontosításai

1. **Vezér**: TELJES kártya (nem kis panel), a BAL oldalon, a húzópaklival egy vonalban (vízszintesen igazítva) — visszatérés a Gwent-0c kör eredeti, bal-oszlopos elrendezéséhez, de a panel helyett a teljes vezér-kártyaképpel.
2. **Időjárás**: a fagy/köd/eső (3 típus) AKTÍV kártyái egy közös, megosztott zónában jelennek meg a BAL oldalon, a két játékos-fél KÖZÖTT (a két Vezér-hely között).
3. **Szín-kódolás**: az AKTÍV (saját, lenti) játékos elemei ARANY, az ELLENFÉL (fenti) elemei EZÜST akcentust kapnak (portré-keret, pontszám-jelvény, vezér-kártya kerete, stb.).
4. **Kártya-nagyítás → karuszel-mintázat, MINDENHOL, de CSOPORTONKÉNT elkülönítve**: nem egyesével, modálban nagyítunk egy kártyát, hanem egy PAKLIT/LISTÁT — a képernyő közepén az aktív (kiválasztott) kártya nagyban, alatta az adatai (magyar fordítás, mert az égetett szöveg angol), körülötte a többi kártya 3D-sen hátrébb/kisebbre véve, ahogy az újrahúzás-referenciaképen látszik. Egy csoport nagyításakor KIZÁRÓLAG az adott csoport elemei látszanak — a csoportok: kézben tartott lapok, saját dobott lapok, ellenfél dobott lapjai, aktív időjárási kártyák, és a hat kijátszott-lap csoport KÜLÖN-KÜLÖN (saját Közelharc/Távolsági/Ostrom, ellenfél Közelharc/Távolsági/Ostrom). Egyelemű csoportnál is ugyanez a felület jelenik meg, csak oldal-kártyák nélkül.
5. **Nincs kontroller/billentyű-jelölés**: a referencia-képeken látható gomb-jelölések (pl. "A Select", "[SPACE] Pass") NEM kerülnek át — minden funkció egérrel/kattintással érhető el, szükség esetén valódi, látható virtuális gombbal.
6. **Játékos-infó panel**: mindkét oldalnak (saját/ellenfél) kell egy önálló infó-panel: profilkép (mindig egy generikus, ember-sziluettes ikon), név, frakció (embléma+név), élet-jelölők, kézben lévő lapok száma, összpontszám — babérkoszorúval körülvéve, ha az adott oldal pontszáma épp magasabb a másikénál.

## Célzott vizuális nyelv

**Paletta** (`gwentTheme.module.css` újraírva):
- `--shell-ground`: sötét dió-barna, `wood-bg.jpg` textúra-alapú (a jelenlegi, alacsony felbontású "kocsma-fotó" lecserélve).
- `--shell-surface`: krém pergamen (`parchment2.jpg`/`parchment4.jpg` alapján) — modálokhoz, tooltip-dobozokhoz, NEM a kártyákhoz (azok már készen vannak).
- `--shell-panel` (ÚJ): a fa sor-panelek középbarna tónusa.
- `--gwent-owner-self` (arany) / `--gwent-owner-opponent` (ezüst) — ÚJ tokenek a lenti/saját ill. fenti/ellenfél oldal player-szintű elemeihez.
- Deck-builder saját, közel fekete háttér-tokent kap (`--shell-builder-ground`) — vizuálisan külön "szoba", ahogy az eredetiben.

**Tipográfia** (ÚJ, önálló betűfájlok):
- `npm install @fontsource/cinzel @fontsource/eb-garamond` (OFL licenc, önállóan hosztolt, NEM CDN).
- `src/client/games/gwent/ui/gwentFonts.ts` (ÚJ) — csak side-effect importok a szükséges vágatokra, importálva `GwentBackdrop.tsx`-ből.
- `--gwent-display-font: 'Cinzel', ...` (címek, gombok, UI-feliratok), `--gwent-body-font: 'EB Garamond', ...` (leírások, magyar fordítás-blokkok).

**Vezérelv minden fázisban**: semmilyen kontroller-/billentyű-gomb-jelölő UI-elem — minden interakció egy ténylegesen kattintható, látható elem.

## Fázisokra bontás

Minden fázis után élő vizuális ellenőrzés (screenshot-összevetés a megfelelő referencia-képpel), mielőtt a következő indul.

### 0. fázis — Asset-pipeline + betűtípus + alap-tokenek

- `scripts/build-gwent-assets.mjs`: a meglévő `processBackground()` mintáját követve (`processImage()` újrahasznosítva) egy ÚJ `processTextures()`, ami `assets/Gwent/design-sample/{wood-bg.jpg, parchment2.jpg, parchment4.jpg, metal.jpg, rust-metal.jpg}`-t dolgozza fel `public/assets/gwent/textures/{wood.jpg, parchment.jpg, parchment-alt.jpg, metal.jpg, rust-metal.jpg}`-ba. A régi `processBackground()`/`BACKGROUND_SOURCE` (a kocsma-fotó) törlődik.
- `npm install @fontsource/cinzel @fontsource/eb-garamond`, `gwentFonts.ts` (ÚJ).
- `gwentTheme.module.css` teljes újraírása a fenti tokenekkel.
- `GwentBackdrop.tsx`: a `background.jpg` helyett a `textures/wood.jpg`-t rendereli.

### 1. fázis — `CardTile.tsx` egyszerűsítés (NEM újraépítés)

Mivel a kártya-képek már tartalmazzák a teljes hivatalos kinézetet, ez a fázis kicsi:
- `size="small"` (táblai/sor-méret): `object-fit: cover` + `object-position: top`, fix, alacsony konténer-magassággal, ami csak a kártya FELSŐ részét (arckép + erő-/képesség-jelvények) mutatja, a névtáblát/flavor-szöveget levágja.
- `size="medium"`/`"large"` (kéz, karuszel, deck-builder): teljes kártyakép, vágás nélkül.
- ÚJ, kis, félig-áttetsző kiegészítő erő-szám overlay a bal felső sarokban, CSAK `size="small"`-nál, CSAK ha a beégetett kör-jelvény szám a kis méretben ténylegesen olvashatatlan lenne.
- A ribbon/nameplate/ability-badge CSS-újraépítés NEM szükséges — a kép már tartalmazza őket.

### 2. fázis — `CardCarouselModal.tsx` (ÚJ, központi, újrafelhasználható komponens)

Ez váltja fel a jelenlegi `CardDetailModal.tsx`, `LeaderDetailModal.tsx`, `DiscardPileModal.tsx` és a `MulliganScreen.tsx` újrahúzás-választóját.

- **Props**: `cards: {def: CardDef | LeaderDef, ...}[]`, `activeIndex`, `onActiveIndexChange`, `onClose`, opcionális `onConfirm?: (card) => void` (mulligan-választáshoz).
- **Elrendezés**: a középső (aktív) index nagy méretben, teljes kártyakép + alatta a magyar fordítás-blokk (`cardTextTranslations.ts` + a meglévő `abilitiesPanel`-koncepció). A szomszédos kártyák CSS `perspective`+`transform` kombinációval kisebbre/hátrébbra/oldalra tolva, csökkenő opacitással a szélek felé.
- **Navigáció**: kattintás egy oldalt lévő kártyára → az lesz az aktív; PLUSZ két látható, valódi `‹`/`›` gomb.
- **Egyetlen elemű lista** triviálisan degenerál egy közép-nagyított nézetre, oldalsó kártyák nélkül.
- Felhasználási helyek — a lista MINDIG csak az adott CSOPORT elemeit tartalmazza:
  - `HandArea` nézegetés-módban → a teljes kéz.
  - `BoardRow`-onként KÜLÖN-KÜLÖN (saját Közelharc/Távolsági/Ostrom, ellenfél Közelharc/Távolsági/Ostrom).
  - Aktív időjárási kártyák (3. fázis) → a jelenleg aktív időjárás-lapok.
  - `DiscardPile`/`DiscardPileModal` → saját ÉS ellenfél dobott lapjai külön csoportként.
  - Pakli-építő kártya-info gomb → az adott gyűjtemény- vagy pakli-lista elemei.
  - `LeaderDetailModal` → egyetlen elemű lista.
  - `MulliganScreen` redraw-választó → a kéz aktuális lapjai, `onConfirm` a redraw-akciót dispatch-eli.

### 3. fázis — Meccs-tábla

- `BoardRow.tsx`: faragott fa panel (`--shell-panel` + `rust-metal.jpg`-alapú keret), bal szélén `metal.jpg`-alapú zsanér-pánt, a meglévő `melee.png`/`ranged.png`/`siege.png` medál-ikon. Az adott sort érintő időjárás finom, féligáttetsző fagy/köd/eső-textúra overlay. Sor-kattintás a `CardCarouselModal`-t nyitja, csak az adott sor lapjaival.
- `PlayerBoardZone.tsx` bal oszlopa: **[ellenfél teljes vezér-kártyája] → [megosztott sáv: aktív időjárás-kártyák] → [saját teljes vezér-kártya]** — a megosztott időjárás-zóna `MatchBoard.tsx` szintjén él. A vezér-kártya a jobb oldali `DeckPile`-lal egy magasságban.
- **ÚJ játékos-infó panel** (a középső oszlop tetején): profilkép (ÚJ generikus ember-sziluett SVG, owner-gyűrűvel), név, frakció embléma+név (ÚJ `factionIcons.tsx`, 4 SVG), `LifeTokens` (ide költözik), kézben lévő lapok száma, összpontszám ÚJ `LaurelWreathIcon`-nal, amikor `computeSideTotal` nagyobb az ellenfélénél.
- `LeaderAbilityPanel.tsx`: logika változatlan, csak a megjelenés igazodik a teljes-méretű vezér-kártyához.
- Gold/silver akcentus (`--gwent-owner-self`/`--gwent-owner-opponent`) a profilkép-keret, pontszám-jelvény, vezér-kártya kerete, húzópakli-jelvény köré.
- Pontszám-buborék: kör alakú, `parchment2.jpg`-alapú jelvény a sor bal szélén.

### 4. fázis — Pakli-építő TELJES szerkezeti átépítése

- **`GwentSetupPage.module.css`**: `--shell-builder-ground` (közel fekete) alapú új szabályrendszer.
- **`FactionStep.tsx`**: a jelenlegi rács helyett középre igazított fejléc-váltó (embléma+név középen, szomszédos frakciók balra/jobbra, ciklikus váltás).
- **`DeckStep.tsx`**: KÉT hasáb — Bal "Gyűjtemény" (kattintásra `changeCount(def, +1)`), Jobb "Pakliban" (csak `count > 0`, kattintásra `changeCount(def, -1)`). A MEGLÉVŐ `changeCount`/`cardCounts` állapot-modell változatlan. Minden csempe a `CardTile` `size="small"` variánsa + külön "info" sarok-gomb, ami a `CardCarouselModal`-t nyitja az adott listával.
- **`LeaderStep.tsx`**: kompakt móddá alakul, a középső oszlopba költözik.
- **Középső oszlop** (`GwentDeckBuilder.tsx`): kiválasztott vezér-kártya + statisztika-lista (lapszám, egység-szám, speciális-szám, összerő, hős-szám).

### 5. fázis — Maradék képernyők, token-szintű igazítás

`StartingChoiceScreen.tsx`, `PassDeviceScreen.tsx`, `RoundSummaryModal.tsx`, `GwentLogPanel.tsx`+`.module.css`, `GwentGamePage.module.css` (győzelmi képernyő) — az új token-rendszer + `CardCarouselModal` bekötése, nincs közvetlen referencia-kép.

## Érintett/új fájlok

- **Új**: `gwentFonts.ts`, `CardCarouselModal.tsx` (+ `.module.css`), `factionIcons.tsx`, `public/assets/gwent/textures/*` (build-generált).
- **Törlődik**: `CardDetailModal.tsx`/`.module.css`, `LeaderDetailModal.tsx`, `DiscardPileModal.tsx`/`.module.css` (beolvadnak a `CardCarouselModal`-ba).
- **Nagy átírás**: `gwentTheme.module.css`, `matchBoard.module.css`, `GwentSetupPage.module.css`, `BoardRow.tsx`, `PlayerBoardZone.tsx`, `GwentDeckBuilder.tsx`, `FactionStep.tsx`, `DeckStep.tsx`, `MulliganScreen.tsx`, `GwentBackdrop.tsx`.
- **Kisebb igazítás**: `CardTile.tsx`, `CardCountGrid.tsx`, `LeaderStep.tsx`, `LeaderAbilityPanel.tsx`, `LifeTokens.tsx`/`.module.css`, `DeckPile.tsx`/`.module.css`, `StartingChoiceScreen.tsx`, `PassDeviceScreen.tsx`, `RoundSummaryModal.tsx`, `GwentLogPanel.tsx`, `GwentGamePage.module.css`, `boardIcons.tsx` (ÚJ: `LaurelWreathIcon`, profilkép-ikon).
- **`scripts/build-gwent-assets.mjs`**: `processTextures()` új, `processBackground()`/`BACKGROUND_SOURCE` törlődik.
- **`package.json`**: `@fontsource/cinzel`, `@fontsource/eb-garamond`.

## Nem változik

A motor (`src/shared/games/gwent/engine/*`) ÉRINTETLEN. A pakli-építő két hasábos átszervezése is csak a renderelést alakítja át, a `cardCounts`/`changeCount` állapot-modell és a `deckRules.ts` validáció változatlan.

## Ellenőrzés

- `tsc`/`eslint`/`npm run test:gwent`/`npm run build` minden fázis után hibamentes.
- Élő Playwright-ellenőrzés fázisonként, a megfelelő `design-sample` képpel összevetve — screenshotok `temp/`-be.
- A `CardCarouselModal` minden csoportjában (kéz, pakli-info, dobott lapok saját+ellenfél, mind a 6 sor-csoport, aktív időjárás, újrahúzás) legalább egyszer kipróbálva, megerősítve a csoport-elkülönítést.
- A játékos-infó panel babérkoszorúja élőben: csak a magasabb összpontszámú oldalon jelenik meg, átvált pontszám-változáskor.
- A pakli-építő új interakcióját mind a négy frakcióval végigjátszva, a `changeCount` határ-eseteivel együtt.
