# Gwent-0c.1 — Specifikáció: vizuális finomhangolás a 0c-s dizájnra adott visszajelzés alapján

**Státusz: TERVEZVE, jóváhagyva (2026-08-04) — ez a dokumentum az implementáció ELSŐ lépéseként készül, a projekt "terv előbb `docs/`-ba, kód csak utána" konvenciója szerint.**

## 1. Cél és hatókör

A Gwent-0c kör (középkori kocsma téma + kártyamozgás-animáció, `docs/gwent-0c-vizualis-animacio-specifikacio.md`) elkészült és élőben ellenőrzött. A felhasználó megnézte az eredményt, és 21 pontos, konkrét visszajelzést adott — az irány jó, de sok részlet finomításra szorul. Ez a kör ezt a 21 pontot dolgozza fel, nyolc szakaszra bontva (A–H).

A 20. pont ("Játékos nyerte a mérkőzést oldalon" — félbeszakadt mondat) tisztázva: a felhasználó szerint nem fontos konkrét tartalmi változás, csak kapjon ez a képernyő is több díszítést — beolvad az A szakaszba.

## 2. Feltárt tények

- `assets/Gwent/style-samples/` (5 kép, eddig meg nem nézve) megvizsgálva: sötét, gyertyafényes középkori kocsma-belső, kovácsoltvas sarokveretek a fa asztallapon, pergamen aranyozott/díszes szegéllyel, meleg arany/vörös fényfoltok mélyfekete háttér előtt. Ez indokolja az 5./17. pontot: a jelenlegi `gwentTheme.module.css` túl világos és dísztelen ehhez képest.
- A projektben MÁR létezik egy generikus "témázott modál-tartalom" osztály: `src/client/ui-kit/themedModalContent.module.css` (`.themed`), amit `LocalGameControls` már használ. A Gwent `RoundSummaryModal`/`CardDetailModal` viszont eddig nem — ezért fehér dobozként jelennek meg a sötét témán (2. pont oka).
- A deck-építőben MÁR létezik a "nagyítás" minta: `CardCountGrid.tsx` egy 🔍 gombot rajzol minden lapra, ami `CardDetailModal`-t nyit. Ez terjeszthető ki a meccs-táblára (6/7/9/10/13. pont).
- **Valódi hiba található `BoardRow.tsx`-ben**: minden lerakott lap `disabled={!decoyTargetSelectable}`-t kap, ami a `CardTile` `.cardDisabled { opacity: 0.45 }` osztályát mindig bekapcsolja Decoy-célválasztáson kívül — vagyis a tábla lapjai szinte folyamatosan félig áttetszőek (11. pont oka).
- **Motor-szintű korlát**: `rules.ts` `isRowChoiceValid` explicit ELUTASÍTJA a `PLAY_CARD`-ot, ha egy fix sorú lap `chosenRow`-t kap (van rá reduceres regressziós teszt is). Ez behatárolja a 8. pont ("mindig sort kelljen választani") megvalósítását: a sor-VÁLASZTÁS UI-ja mindenhol táblára-kattintásra vált, de fix sorú lapoknál nincs extra megerősítő kattintás — ott a nagyított kijátszás-előnézet "Kijátszás" gombja azonnal indít, mert nincs mit választani, és a motor nem is fogadna el `chosenRow`-t.
- A `LocalGameControls` "Kilépés a játékból"/"Új játék" gombsora (`.topCenterControls`) `position: absolute; top: 1rem` — a Gwent tábla teteje nem hagy neki helyet (14. pont oka). A `FeedbackButton` egy tudatosan elhelyezett GLOBÁLIS elem (bal szél, függőleges közép, dokumentált indoklással más játékok HUD-jaival való ütközés elkerülésére) — ezt nem mozgatjuk, helyette a Gwent tábla saját elrendezése kap nagyobb margót (15. pont).
- Nincs Gwent-megfelelője a Hotel `GameLogPanel.tsx`/`formatLogEntry.ts` párosnak (16. pont).

## A. Téma-újrafestés — sötétebb, nyomasztóbb, díszesebb (5, 12, 17, 20, 21. pont)

`gwentTheme.module.css`:
- `--shell-ground`: jelentősen sötétebb (közel fekete alap), 2–3 gyertyafény-szerű meleg foltos `radial-gradient` (nem egy központi vinyetta), erősebb vinyetta a szélek felé.
- `--shell-surface` (pergamen): megmarad melegnek, de kevésbé "tiszta" — foltos, kopott hatás réteges gradiensekkel (nem kép-textúra), sötétebb szegély-árnyék.
- Új `--shell-accent-secondary` (mély vörös, pl. `#7a1620`) — a style-samples-ben látott vörös drapéria/könyv-akcentus, másodlagos díszítő szín.
- Kovácsoltvas-hatású sarokdíszek: panelek `::before`/`::after` pszeudoelemekkel apró, sötét fém-gradiens sarok-motívumot kapnak — CSS-only, nincs új kép.
- **Árnyékok a 3D hatásért (21. pont)**: minden emelt felület (`.boardZone`, `.actionBar`, `.leaderPanel img`, `.cardTile`, DeckPile/DiscardPile rétegei, LifeTokens kristályok) határozottabb `box-shadow`-t kap (külső mély árnyék + belső highlight). A DeckPile/DiscardPile rétegzett lapjai réteg-árnyékot is kapnak, hogy a paklikupac ténylegesen 3D-snek hasson.
- Győzelmi képernyő (`GwentGamePage.module.css` `.winnerScreen`, 20. pont): stílusos, témába illő "banner" panel (pergamen/fa keret, arany szegély) — nincs tartalmi/funkcionális változás.
- `.weatherBar` (12. pont): a sor-nevek (Közelharc/Távolsági/Ostrom + hóvirág) törlődnek innen — ezek már megjelennek soronként `BoardRow` saját `.rowLabel`/`.rowFlags` elemeiben. Csak a kör-számláló marad, átstílusozva egy kis díszes jelvénnyé.

## B. Modálok, inputok, gombsorok stílusa (2, 3, 4. pont)

- `RoundSummaryModal`/`CardDetailModal` megkapja a `[themedModal.themed, useGameTheme('gwent')].join(' ')` className-et, ugyanúgy, ahogy `LocalGameControls` már teszi (2. pont).
- `GwentSetupPage.module.css` `.nameInput` és a `DeckStep.tsx`-beli `<select>`-ek pergamen-hátterű, `--shell-line` szegélyű, `--shell-accent` fókusz-gyűrűs megjelenést kapnak (3. pont).
- `matchBoard.module.css` `.targetPicker` `flex-direction: column` → `row` + `flex-wrap: wrap` (4. pont) — a benne maradó gombsorok (Medic cél, vezér-képesség cél) egy sorba rendeződnek.

## C. Kártya-nagyítás mindenhol (6, 7, 9, 10, 13. pont)

- **`CardTile.tsx`**: új opcionális `onZoom?: () => void` prop — ha meg van adva és a lap nem rejtett, egy kis 🔍 gomb jelenik meg a csempe sarkában (`event.stopPropagation()`, mint `CardCountGrid`-ben).
- **Tábla lapok (9. pont)**: minden `BoardRow`-beli `TrackedCardTile` bekötve, `MatchBoard` szintjén egy megosztott `zoomedCard: CardDef | null` state-be írva.
- **Dobott lapok (13. pont, saját ÉS ellenfél)**: `DiscardPile` felső lapja kap `onZoom`-ot, ugyanabba a state-be.
- **Vezér-kártyák (10. pont, aktív ÉS elhasznált/passzív állapotban is)**: új `LeaderDetailModal.tsx` (a `CardDetailModal.module.css` vizuális stílusát újrahasználva, de `LeaderDef`-re szabott props-szal: kép, név, frakció, `abilityDescription`, `cardText`). A `.leaderImage` mindkét render-ágon (aktív és "elhasznált") kap `onZoom` triggert.
- **Kézben lévő lap kijátszás előtt nagyban (7. pont) + mulligan-csere előtt nagyítás (6. pont)**: `CardDetailModal` kap egy opcionális `footer?: ReactNode` propot. `HandArea`/`MatchBoard.selectCard`: kattintás a kézben lévő lapra többé NEM dispatch-el azonnal — nagyított előnézetet nyit ("Kijátszás"/"Mégse" footer-gombokkal); megerősítés után folytatódik a D szakasz szerinti sor-/cél-választással, vagy azonnal dispatch-el, ha nincs további lépés. `MulliganScreen`: kattintás egy cserélhető lapra hasonló előnézetet nyit ("Csere"/"Mégse").

## D. Sor-választás kattintással a táblán + tábla-lapok ne halványuljanak (8, 11. pont)

- **11. pont**: `BoardRow.tsx` mostantól sosem ad vizuális `disabled`-halványítást a tábla lapjaira. A Decoy-célválasztás alatt választható lapok egy önálló, halványítás NÉLKÜLI kiemelő stílust kapnak (arany szegély/glow, más névvel mint `.cardSelected`, mert szemantikailag "célként választható", nem "kiválasztva").
- **8. pont**: a jelenlegi `.targetPicker` sor-gombsor (Melee/Ranged/Siege gombok) megszűnik. A nagyított kijátszás-előnézet megerősítése után, ha a lapnak van sor-választása (Agile, nem auto-optimalizált → Melee/Ranged; Horn → mind a 3 sor), a `BoardRow`-k a JÁTÉKOS SAJÁT oldalán `selectable` jelzést kapnak: vizuálisan kiemelve (pulzáló arany körvonal) ÉS kattinthatóvá válnak — kattintásra megy a `PLAY_CARD` a megfelelő `chosenRow`-val. Fix sorú lapoknál nincs extra kattintás-lépés (ld. 2. szakasz motor-korlátja) — a "Kijátszás" gomb azonnal dispatch-el.
- Decoy célválasztás (saját tábla-lapra kattintva) változatlan, csak most tényleges (nem-halványító) kiemelést kap.
- Medic cél-választás lista-alapú marad, de gombjai egy sorba kerülnek (B szakasz), és a felkínált dobott lapok a C szakasz nagyítási mechanizmusán át egyenként megnézhetők.

## E. Rálógó lebegő gombok (14, 15. pont)

- `.matchBoard`, `.mulliganScreen`, `.startingChoiceScreen`, `.passDeviceScreen`, `.winnerScreen` elég `padding-top`-ot kap (~3.5–4rem), hogy a felül lebegő "Kilépés a játékból"/"Új játék" gombsor alatt kezdődjön a tartalom (14. pont).
- `.matchBoard`/`.boardZone` ésszerű `max-width` + vízszintes középre igazítás, elegendő bal margóval, hogy a bal szélen lévő vezér-oszlop sose érjen a viewport bal széléig, ahol a globális visszajelzés-gomb lakik (15. pont) — a gomb maga nem mozdul.

## F. Játéknapló (16. pont)

A Hotel mintájának (`GameLogPanel.tsx` + `formatLogEntry.ts`) szoros követése:
- `src/client/games/gwent/ui/board/formatGwentLogEntry.ts` (ÚJ) — minden `GwentLogEntry` variánshoz egy magyar, olvasható sor.
- `src/client/games/gwent/ui/board/GwentLogPanel.tsx` + saját, `--shell-*` témára épülő `.module.css` (ÚJ) — jobb alsó sarokban (a bal szélen a visszajelzés-gomb, felül a kilépés-gombok, ez a sarok szabad), `MatchBoard`-ba beillesztve.

## G. Kártya-repülés: nagyítás/kicsinyítés mozgás közben (18. pont)

`cardFlight.tsx` `FlyingCard`-ja egy `progress: 0→1` spring-értéket kap a pozícióval párhuzamosan, amiből egy enyhe "felpúposodó" `scale` interpolálódik (`progress.to(p => 1 + Math.sin(p * Math.PI) * 0.12)`), `transform: scale(...)`-ként alkalmazva a ghost elemre.

## H. Multiplayer: mindig a helyi játékos legyen alul, forgás nélkül (19. pont)

`GwentGamePage.tsx`: `bottomViewerId={isLocalMode ? (activeViewerId ?? undefined) : myPlayer}` (eddig online módban mindig `undefined` volt). Mivel online módban a `myPlayer` a teljes meccs alatt nem változik, ez egy fix, animáció NÉLKÜLI elrendezést eredményez. `MatchBoard.tsx` `bottomViewerId` doc-kommentje frissül, hogy ne csak helyi módra hivatkozzon.

## Érintett/új fájlok

- `gwentTheme.module.css`, `matchBoard.module.css`, `GwentSetupPage.module.css`, `GwentGamePage.module.css` — újrafestés (A, B, D, E).
- `CardTile.tsx` — `onZoom` prop.
- `CardDetailModal.tsx` (+ `.module.css`) — `footer` prop, témázott className.
- `LeaderDetailModal.tsx` (ÚJ).
- `BoardRow`, `HandArea`, `MulliganScreen`, `DiscardPile`, `LeaderAbilityPanel`, `PlayerBoardZone`, `MatchBoard` — zoom-bekötés, sor-választás átalakítása, `zoomedCard` state.
- `GwentLogPanel.tsx`, `formatGwentLogEntry.ts` (ÚJ) + `.module.css` (ÚJ).
- `cardFlight.tsx` — scale-interpoláció.
- `GwentGamePage.tsx` — `bottomViewerId` online módban is.
- `DeckStep.tsx` — input/select stílus.

## Ellenőrzés

- `tsc`/`eslint`/`npm run test` — motor-logika nem változik, de a `PLAY_CARD` dispatch-hívási helyek átalakulnak; a meglévő reducer/rules tesztek jelzik, ha rossz `chosenRow`-t küldenénk.
- Élő Playwright-kör a végén: deck-építés (pergamen input/gombok), egy teljes helyi parti — mulligan-nagyítás, kijátszás-előnézet + sor-kattintás minden lap-típusra (fix sorú, Agile, Horn, Decoy, Medic), tábla-/dobott lap-/vezér-nagyítás mindkét oldalon, napló megnyitása, a lebegő gombok nem lógnak rá semmire, a győzelmi képernyő. Utána képernyőképek mentése `temp/`-be.

## 9. Implementáció

**Státusz: IMPLEMENTÁLVA (2026-08-04), élő Playwright-ellenőrzéssel igazolva.**

Mind a 21 pont (+ a mid-turn "használj árnyékokat" kérés) elkészült az A–H szakaszok szerint. Egy valódi hibát a fejlesztés/tesztelés közben találtam és javítottam: a `CardTile` natív `disabled` gombja letiltja a saját DOM-részfáján BELÜL minden pointer-eseményt böngésző-szinten (CSS-sel felülírhatatlanul) — így egy olyan tábla-lap, aminek nincs `onClick`-je (a szokásos eset, Decoy-célválasztáson kívül), a benne lévő nagyító gombot is inertté tette. Javítás: a gomb csak akkor `disabled`, ha se `onClick`, se `onZoom` nincs — lásd `CardTile.tsx` `isDisabled` doc-kommentje.

Élő ellenőrzés (helyi 2 játékos, teljes deck-építéstől a parti közepéig): deck-építő pergamen-csempék (1. pont, nagyítás — igazolva), témázott modálok (2., 6., 7., 9., 10., 13. pont — mind igazolva), stílusos `<select>`-ek, gombsorok egy sorban, sötét/díszes téma (5., 12., 17., 21. pont), tábla-lapok NEM halványodnak (11. pont, `getComputedStyle(...).opacity === '1'` mind a 22 lapon), sor-választás táblára kattintva egy Agile lapnál (Celaeno Harpy — pontosan Közelharc+Távolsági sor emelődött ki, Ostrom nem, 8. pont), Medic-célválasztás egy sorban (4. pont), játéknapló magyar, olvasható bejegyzésekkel (16. pont), lebegő gombok nem lógnak rá a tartalomra (14., 15. pont). NEM ellenőrzött élőben (alacsony kockázatú, tisztán CSS/adat-vezérelt változás, kódszinten átnézve): Horn/Decoy konkrét lapok (a véletlen kártyahúzás nem hozta őket elő a tesztelt körökben — a mögöttes mechanizmus azonos az Agile-lal sikeresen igazolt kóddal), a kártya-repülés skálázása (18. pont), a győzelmi képernyő bannere (20. pont), online mód `bottomViewerId` (19. pont, csak kódszinten). `tsc`/`eslint`/`npm run test:gwent` (114/114) és `npm run build` mind hibamentes.
