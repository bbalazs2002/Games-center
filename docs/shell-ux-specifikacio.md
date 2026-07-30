# Játékfüggetlen UX-fejlesztések — Specifikáció

**Státusz:** IMPLEMENTÁLVA és élesben (Playwright) ellenőrizve — lásd 10. szakasz. **Kiegészítve** egy egyedi select/checkbox UI-cserével és az online kapcsolódási hibaüzenetek fordításával (2026-07-30) — lásd 11. szakasz.
**Utolsó frissítés:** 2026-07-30
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md) (roadmap-tétel 4d), [b-klaszter-ui-specifikacio.md](./b-klaszter-ui-specifikacio.md) (a per-játék "téma" fogalom előzménye), [hotel-0c-specifikacio.md](./hotel-0c-specifikacio.md) / [ramses-0a-specifikacio.md](./ramses-0a-specifikacio.md) (a jelenlegi Hotel/Ramses paletta forrása)

## 1. Cél és hatókör

A felhasználó négy, egymástól független, de közös infrastruktúrán osztozó kérést fogalmazott meg (2026-07-29) — mindegyik a **shell/platform réteget** érinti (`src/client/shell/`, `src/client/ui-kit/`), nem egyetlen konkrét játékot:

1. **Játékszabály** — minden játékhoz egy szabály-modál, a mód-választó oldalon (Lokális/Multiplayer gombok alatt egy harmadik gombbal), a játékhoz illeszkedő stílusban.
2. **Hibabejelentő** — hiba/javaslat küldése a menüből ÉS játék közben; játékon belülről küldve a teljes elérhető kontextussal (állapot, játékosok, esemény napló, ha a játék motorja tárol ilyet).
3. **Lobby + játékválasztó stílus** — a Lobby vegye fel az adott játék saját vizuális nyelvét (mint most a B-klaszter "Rács"-a Dámánál); a főoldali játékválasztó ezzel szemben maradjon egységes, letisztult, minden játék stílusától FÜGGETLEN, dobozkép + név csempés elrendezésben.
4. **Betöltő képernyő** — a jelenlegi puszta `<p>Betöltés…</p>` helyett egy, az adott játék stílusához illeszkedő, közepén pulzáló "BETÖLTÉS…" felirat.

**Közös felismerés, ami a tervet összeköti:** az 1., 3. (Lobby fele) és 4. pont mindegyike ugyanazt az alapkérdést veti fel — *"hogyan jelenítsünk meg egy MEGOSZTOTT (shell-szintű) komponenst egy KONKRÉT játék vizuális nyelvén?"* Ma erre pontosan egy előzmény van: a B-klaszter `clusterBTheme.module.css` (lásd [b-klaszter-ui-specifikacio.md](./b-klaszter-ui-specifikacio.md) §3) — de az kizárólag Dáma saját oldalaiba van bekötve, nem egy újrafelhasználható, játék-azonosító alapján kiválasztható rendszer. Ez a terv ezt a mintát emeli ki egy tényleg megosztott, `gameId`-alapú "téma-választó" mechanizmussá (2. szakasz) — ez az alapja mindhárom vizuális pontnak.

**Hatókörben van:**
- Egy új, megosztott "játék-téma" regisztráció (2. szakasz) — Hotel és Ramses jelenlegi (kódban már létező, csak nem újrafelhasználható módon beégetett) palettájának kiemelése saját téma-modulba, a Dáma/B-klaszter mintájára.
- `RulesModal` — megosztott, `gameId`-t kapó komponens + játékonként egy lusta-betöltött tartalom-komponens.
- Hibabejelentő UI (lebegő gomb + form-modál) + egy game-agnosztikus React Context, amin keresztül egy éppen futó játék oldal a saját (opcionális) kontextusát "publikálja" anélkül, hogy a hibabejelentő komponensnek bármit tudnia kéne az adott játék belső state-alakjáról.
- `LobbyPage.tsx` — a `gameId` alapján felveszi az adott játék témáját.
- `HomePage.tsx` — teljes újratervezés: csempés rács, dobozkép + név, játék-független, letisztult stílus.
- `LoadingScreen` — megosztott komponens, játék-témával paraméterezve, minden meglévő `<Suspense fallback>` helyén.
- Backend: egy új, minimális `/api/feedback` végpont + Prisma tábla a beküldött hibák/javaslatok tárolására.
- **Dáma és Ramses motorja** (`state.ts`/`reducer.ts`) — minimális, Hotel `state.log`-jának mintáját követő eseménynapló hozzáadása mindkettőhöz, kizárólag a hibabejelentő kontextusához (lásd 4.2.1) — a felhasználóval egyeztetett, tudatosan bővített hatókör.

**Nincs hatókörben (tudatosan kihagyva, indoklással):**
- **Adminfelület a beérkezett hibákhoz** — a projekt jelenlegi léptékén (családi/baráti kör, egyetlen üzemeltető: te) egy közvetlen adatbázis-lekérdezés (ahogy eddig is, pl. `docker exec ... psql`) elég a beküldött visszajelzések átnézéséhez; egy dedikált admin-UI külön, jövőbeli kérés lenne, ha tényleg szükségessé válik.
- **Dáma/Ramses esemény naplójának megjelenítése a játékon BELÜL** (egy Hotel `GameLogPanel`-hez hasonló UI) — a 4.2.1 szakasz szerinti motor-bővítés CÉLJA kizárólag a hibabejelentő kontextusa, nem egy új, játékosoknak szóló funkció. Ha a `state.log` egyszer létezik, egy ilyen panel triviálisan ráépíthető később, de ez a kör nem építi meg.
- **A `Button`/`Modal`/`Menu` ui-kit komponensek saját alapértelmezett stílusa** — továbbra is játék-független, ahogy eddig; a per-játék téma a `className` prop felülírásán/CSS custom property-k öröklésén keresztül hat rájuk, nem a komponensek saját CSS-én.

## 2. Közös alap: `gameId` → vizuális téma

### 2.1 Miért kell egy új absztrakció

Ma három, EGYMÁSTÓL FÜGGETLEN, egyik játékhoz sem kívülről elérhető paletta létezik:

| Játék | Hol él ma | Stílus |
|---|---|---|
| Dáma (B-klaszter) | `src/client/renderers/grid-2d/clusterBTheme.module.css` — **már ma is egy önálló, exportált `.theme` osztály CSS custom property-kkel** | meleg mészkő/pergamen, öregedett bronz kiemelő szín, szerif cím-betű |
| Hotel | `HotelGamePage.module.css`, `PlayerActionWheel.module.css`, ... — **beégetve, minden fájlban külön hex-kóddal megismételve** | sötét "üveg" panel (navy gradiens), arany (`#d4af37`) kiemelés, krém (`#f3ecd9`) szöveg |
| Ramses | `RamsesGamePage.module.css` — **szintén beégetve** | sötét, meleg barna/homok gradiens (`#2a2010`→`#0d0a06`), ugyanaz a krém szöveg, ma nincs önálló kiemelő szín |

A Dáma-eset (B-klaszter) MÁR a helyes mintát követi (lásd [b-klaszter-ui-specifikacio.md](./b-klaszter-ui-specifikacio.md) §3) — csak sosem lett kiemelve egy olyan helyre, ahonnan a Lobby/RulesModal/LoadingScreen (amik nem tudhatják előre, melyik játékról van szó, csak a `gameId` stringet kapják route-paraméterként) elérhetné.

### 2.2 Javasolt architektúra

Minden játék kap egy saját, kis téma-modult (Dáma esetén ez már létezik, csak érintetlen marad; Hotel/Ramses esetén ÚJ, a meglévő hex-kódok egyszerű kiemelésével, ÚJ szín kitalálása nélkül):

```
src/client/games/dama/ui/          → src/client/renderers/grid-2d/clusterBTheme.module.css  (VÁLTOZATLAN, csak referálva)
src/client/games/hotel/ui/hotelTheme.module.css   → ÚJ, a HotelGamePage.module.css .page/.statusChip/stb. már meglévő színeiből kiemelve
src/client/games/ramses/ui/ramsesTheme.module.css → ÚJ, a RamsesGamePage.module.css már meglévő színeiből kiemelve
```

Egy game-agnosztikus regisztráció köti össze a `gameId`-t a témával — a `gamesRegistry.ts`-t bővítjük egy új, opcionális mezővel:

```ts
export interface GameDescriptor {
  id: string;
  label: string;
  load: () => Promise<{ default: ComponentType }>;
  online?: GameOnlineOptions;
  /** ÚJ — a Lobby/RulesModal/LoadingScreen ezzel a class-szal (a page legfelső wrapper divjén) veszi fel a játék saját vizuális nyelvét. Game-agnosztikus, dinamikusan importált, hogy egy másik játék témája se kerüljön be a fő bundle-be. */
  theme?: () => Promise<{ default: string }>; // a CSS Modules osztálynevet adja vissza
  /** ÚJ — a szabály-modál tartalma, lustán betöltve (lásd 3. szakasz). */
  rules?: () => Promise<{ default: ComponentType }>;
}
```

Ez PONTOSAN a már meglévő `load` mező mintáját követi (dinamikus `import()`, code-splitting) — egyetlen új konvenció sincs bevezetve, csak két új, opcionális, ugyanúgy viselkedő mező.

**Alkalmazás módja** (mind a Lobby, mind a RulesModal, mind a LoadingScreen esetén): egy közös `useGameTheme(gameId)` hook lustán betölti a `theme()` modult, és a visszakapott class-nevet a wrapper `<div>` `className`-jébe fűzi — pontosan úgy, ahogy `DamaGamePage.tsx` ma is teszi a `clusterBTheme`-mel (`className={[styles.page, theme.theme].join(' ')}`), csak most a hívó oldal (Lobby/RulesModal/LoadingScreen) nem ismeri előre, melyik játék témáját tölti be.

### 2.3 Mit NEM tartalmaz egy téma-modul

A B-klaszter tokenkészlete (szín, tipográfia, tábla/bábu-specifikus tokenek) TÚL sok Dáma/rácsos-játék-specifikus dolgot tartalmaz ahhoz, hogy 1:1 átvegye Hotel/Ramses. A Lobby/RulesModal/LoadingScreen kontextusában csak egy SZŰKEBB, közös részhalmazra van szükség — ezt minden téma-modulnak kötelezően biztosítania kell, a többi (tábla/bábu-specifikus) token opcionális marad:

| Token | Kötelező? | Szerep |
|---|---|---|
| `--shell-ground` | igen | oldal-háttér (gradiens vagy egyszínű) |
| `--shell-surface` | igen | panel/kártya/modál háttér |
| `--shell-ink` | igen | elsődleges szöveg |
| `--shell-ink-soft` | igen | másodlagos szöveg |
| `--shell-accent` | igen | kiemelő szín (cím, gomb, fókusz) — Ramses-nél ma nincs ilyen, ÚJ döntés kell (8. szakasz) |
| `--shell-line` | nem (van ésszerű alapérték) | keret/elválasztó vonal |

## 3. Játékszabály modál

**Elhelyezés:** `GameModeSelectPage.tsx` — harmadik gomb a "Lokális játék"/"Multiplayer" alatt: `<Button variant="secondary" onClick={() => setRulesOpen(true)}>Játékszabály</Button>`.

**Tartalom forrása:** minden játék kap egy saját `<GameId>Rules.tsx` komponentet (`gamesRegistry.ts`-ben `rules: () => import('../games/hotel/ui/HotelRules')` — lustán betöltve, ugyanúgy code-splittelve, mint maga a játék). A szöveg forrása a már meglévő, a felhasználóval egyeztetett szabály-leírás a spec-dokumentumokból (pl. [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md) §2 — a Hotel teljes, verbátim szabálya már le van írva ott), játékos-barát formára szerkesztve (rövidebb, listás, nem tervezési próza). Ahol van hozzá kép (pl. Hotel property-card fotók), azok újrahasználhatók illusztrációként.

**Megjelenítés:** a megosztott `Modal` (a nemrég bővített `className` prop — lásd a legutóbbi kör) + a 2. szakasz `useGameTheme(gameId)`-je, tehát a modál automatikusan az adott játék "üveg-panel" nyelvén jelenik meg (Hotel-nél navy+arany, Ramses-nél barna+homok, Dáma-nál a Rács-pergamen), a friss X-gomb/görgethetőség/z-index javításokat örökölve.

**Nem igényel külön route-ot** — a felhasználó kifejezetten jelezte, hogy egy modál elég, nem kell külön oldal.

## 4. Hibabejelentő

### 4.1 Belépési pontok

- **Menüből** (HomePage és/vagy GameModeSelectPage) és **játék közben** egyaránt elérhető legyen — a legkevésbé invazív, MINDEN oldalon egységes megoldás egy globális, layout-szintű lebegő gomb (pl. jobb alsó sarok, kis buborék-ikon), amit egyetlen helyen kötünk be, nem minden egyes `GamePage`-be külön.
- Ehhez a `routes.tsx`/`App.tsx` jelenleg NEM használ közös layout-wrappert (minden route saját elemet renderel, nincs `<Outlet/>`-es közös keret) — ÚJ: egy `RootLayout` bevezetése egy layout-route-tal, ami a lebegő gombot (és a hozzá tartozó modált) egyszer, minden route felett rendereli.

### 4.2 Kontextus játékon belülről

Egy game-agnosztikus `FeedbackContext` (React Context, a `RootLayout` alatt), amit egy adott `GamePage` egy apró hookkal (`useReportFeedbackContext(gameId, state)`) tölt fel, amikor mountol / a state változik — a hibabejelentő modál, ha nyitva van egy játék KÖZBEN, ezt a legutóbb publikált `{gameId, state}` párost olvassa ki és csatolja a beküldött üzenethez, NYERS JSON-ként (a hibabejelentő komponens semmit nem tud/nem is kell tudnia az adott játék state-jének alakjáról).

**Eldöntve (2026-07-29):** a felhasználó a "bővítsük mindhárom motort" opciót választotta — tehát ez a kör Dáma-nak és Ramses-nek is ad egy minimális, Hotel `state.log`-jának mintáját követő eseménynaplót, nem csak a pillanatnyi állapot pillanatképét. Ezzel a `contextJson` mindhárom játéknál lépésenkénti történetet is tartalmaz, nem csak a "hol áll most" pillanatképet.

### 4.2.1 Minimális esemény-napló Dámához és Ramses-hez

Mindkét motor ma egyetlen akciótípust ismer (`MOVE` / `SLIDE_PYRAMID`), ami a naplót nagyon egyszerűvé teszi — nincs szükség Hotel méretű, sokféle-eseménytípusú union-ra, elég egyetlen bejegyzés-alak típusonként, a reducer saját, már meglévő elágazásainak megfelelő extra mezőkkel:

**Dáma** (`src/shared/games/dama/engine/state.ts`):
```ts
export interface MoveLogEntry {
  player: Player;
  from: Position;
  to: Position;
  captured: Position | null;   // applyCapture már ma is ismeri ezt (move.captured)
  becameKing: boolean;         // applySimpleMove/applyCapture már ma is számolja (promotes)
}
// DamaState bővül: log: MoveLogEntry[];
```
A reducer egyetlen új sort kap minden `applySimpleMove`/`applyCapture` ág végén (`appendLog`-szerű segédfüggvény, Hotel mintájára) — a láncütés minden egyes ugrása külön bejegyzés, ahogy a mozgás maga is külön `MOVE` akció.

**Ramses** (`src/shared/games/ramses/engine/state.ts`):
```ts
export interface RamsesLogEntry {
  playerId: PlayerId;
  fromCellId: string;
  toCellId: string;            // az addig üres mező, ahova a piramis csúszott
  treasureRevealed: string | null; // null = üres mező volt alatta, a kör folytatódik
  matched: boolean;             // treasureRevealed === activeCard.treasureId volt-e
  pointsAwarded: number;        // > 0, ha matched és a kártya ezért pontot ért
}
// RamsesState bővül: log: RamsesLogEntry[];
```
A `reducer.ts` `applySlidePyramid`-jának mindhárom kimenete (üres mező — kör folytatódik; helyes találat — kártya jár; rossz kincs — kör átadódik) egyértelműen leképezhető egy-egy bejegyzésre, mivel a függvény már ma is pontosan ezt a három ágat különbözteti meg.

**Következmény a hibabejelentő 4.2 szakasz szerinti kontextusára, a bővítés után:**

| Játék | `players` | esemény napló |
|---|---|---|
| Hotel | igen (név, pénz, telkek) | igen (`state.log`, már ma is létezik) |
| Ramses | igen (név, nyert kártyák) | igen (`state.log`, ÚJ ebben a körben) |
| Dáma | nincs önálló `players` fogalma (csak `currentPlayer`) | igen (`state.log`, ÚJ ebben a körben) |

Dáma esetén a "játékosok" adat továbbra is csak a `currentPlayer`/tábla pillanatkép szintjén elérhető (nincs név/pontszám-fogalma a motornak) — ez nem a hibabejelentő hiánya, hanem Dáma játékszabályának természetes következménye (2 oldal, nem "játékosok" birtokolt erőforrásokkal).

**Implementációs következmény:** mindkét motor reducer.test.ts-e kap néhány új tesztet, ami ellenőrzi, hogy a napló ténylegesen bővül a várt bejegyzéssel minden akció után (Hotel `reducer.test.ts`-ének meglévő `log`-ellenőrző mintáit követve).

### 4.3 Adatmodell és tárolás

Új Prisma modell (a meglévő `GameSession`/`User` minta mellé, `prisma/schema.prisma`):

```prisma
model FeedbackReport {
  id         String   @id @default(uuid())
  type       String   // "BUG" | "SUGGESTION"
  message    String
  gameType   String?  // null, ha a menüből érkezett, nem játékon belülről
  contextJson Json?   // a 4.2 szerinti state-pillanatkép, ha volt
  userId     String?  // null, ha be sem volt jelentkezve (pl. hot-seat módból, ahol nincs kötelező auth)
  userAgent  String?
  createdAt  DateTime @default(now())

  @@map("feedback_reports")
}
```

Új, minimális szerver route: `POST /api/feedback` (`src/server/core/feedbackRoutes.ts`, a meglévő `localGameLogRoutes.ts` mintájára) — **NEM kötelező auth** (a `/games/:gameId/local` út ma sincs `RequireAuth`-mögé zárva, tehát hot-seat módból JWT nélkül is el kell tudni küldeni egy hibát), a `userId`-t csak akkor tölti ki, ha VAN érvényes `Authorization` fejléc.

### 4.4 UI

- Lebegő gomb → kis form-modál: típus (Hiba / Javaslat rádiógomb), szabad szöveg mező, "Küldés" gomb.
- Ha van aktív játék-kontextus (4.2), egy rövid, nem-szerkeszthető sor jelzi: *"A jelenlegi játékállapot csatolva lesz."* — átláthatóság, nem csendben küldünk el semmit.
- Sikeres küldés után egyszerű visszajelzés ("Köszönjük, elküldve!"), a modál bezár.
- A modál a HELYSZÍNTŐL függően a menü (game-független, semleges) vagy az aktuális játék témáját veszi fel — ha épp egy Hotel-parti közben nyílik, Hotel-stílusban jelenik meg (ugyanúgy a 2. szakasz `useGameTheme`-jén keresztül); a menüből nyitva egy semleges, a 6. szakasz szerinti alap-stílust kapja.

## 5. Lobby + játékválasztó stílus

### 5.1 `LobbyPage.tsx` — felveszi az adott játék témáját

`const theme = useGameTheme(gameId)` (2. szakasz), a legfelső wrapper `<div>` a saját `styles.page` MELLÉ a téma class-t is felveszi — pontosan a Dáma/B-klaszter minta, csak most nem csak Dámánál, hanem Hotel/Ramses Lobby-jánál is. A `LobbyPage.module.css` saját, konkrét színei (`#...` hex-kódok helyett) a 2.3 szakasz `--shell-*` custom property-jeire váltanak, hogy a téma tényleg át tudja írni őket.

**Ez az egyetlen konkrét kódmódosítás ebben a szakaszban** — a `CreateRoomModal`/join-modál a Modal-en keresztül ugyanígy örökli a témát.

### 5.2 `HomePage.tsx` — játék-független, letisztult csempe-rács

Teljesen új, saját, EGYETLEN, semleges dizájn (nem 4 különböző játék valamelyikéé) — ez direkt válasz a kérésre: *"legyen letisztult, modern és független a játékok stílusától."* Javasolt irány (a pontos vizuális részletek nem véglegesítettek — ez az a pont, ami egy önálló Artifact-mockupot érdemelne, a B-klaszter körben bevált módon, mielőtt a valódi kódba kerülne):

- Semleges, sötét vagy világos alap (a `prefers-color-scheme`-et követve, ahogy eddig minden más réteg) — NEM Hotel/Ramses/Dáma egyik saját palettája.
- Rács-elrendezés (`display: grid`, reszponzív oszlopszám), egy csempe/játék: dobozkép (felül, `object-fit: cover`, lekerekített sarok) + játék neve (alul, középre igazítva).
- **Üveg hatás a csempéken** (a felhasználó kérésére, jóváhagyáskor hozzáadva — lásd 9. szakasz): minden csempe egy félig áttetsző, `backdrop-filter: blur(...) saturate(...)` panel-hátteret kap, ugyanazt az anyagnyelvet idézve, amit a Hotel/Ramses/Lobby panelek (StatusChip, OwnedLotsPanel, ...) már ma is használnak — csak semleges, game-független színen, nem valamelyik játék saját paletáján.
- Amíg a valós dobozfotók nincsenek a repóban (lásd 8. szakasz), egy egyszerű, monogram-alapú helyettesítő csempe (játék kezdőbetűje egy tompított háttérszínen) — így a rács-elrendezés/komponens már most, kép nélkül is tesztelhető és később egy fájl-csere az egész.
- Kattintás → `navigate('/games/:id')`, változatlan útvonal-logika, csak a megjelenés cserélődik.

**`gamesRegistry.ts` bővítése:** egy új, opcionális `coverImage?: string` mező (a kép útvonala, pl. `/assets/covers/hotel.jpg`) — hiányzó kép esetén a monogram-helyettesítő fut.

## 6. Betöltő képernyő

Egy megosztott `LoadingScreen` komponens (`src/client/ui-kit/LoadingScreen.tsx`), ami MINDEN jelenlegi `<Suspense fallback={<p>Betöltés…</p>}>` helyére kerül (`routes.tsx` — 4 hely, `GameLoader.tsx` — 1 hely):

```tsx
<Suspense fallback={<LoadingScreen gameId="hotel" />}>
```

- `gameId` prop → `useGameTheme(gameId)` (2. szakasz) → a teljes képernyőt kitöltő, a játék saját háttér-gradiensét felvevő overlay.
- Középen egy pulzáló (CSS `@keyframes`, `prefers-reduced-motion` mellett kikapcsolva/statikus) "BETÖLTÉS…" felirat, a téma kiemelő színén.
- Azoknál a route-oknál, ahol a `gameId` route-paraméterként ismert (mind az 5 jelenlegi hely — lásd 1. szakasz "Nincs hatókörben" listája fölött), mindig konkrét témát kap; nincs olyan mai eset, ami "témátlan" (game-független) betöltést igényelne, tehát nincs szükség kötelező semleges alapértelmezésre — de a komponens `gameId?: string` opcionálisként készül, semleges (6. szakasz szerinti, HomePage-stílusú) alapértelmezéssel, a jövőbeli, esetleg game-független betöltő helyzetek miatt.

## 7. Fájlok összefoglalása

```
src/client/ui-kit/
  LoadingScreen.tsx / .module.css       # ÚJ
  RulesModal.tsx                        # ÚJ — game-agnosztikus keret, gamesRegistry .rules-t tölti be
  FeedbackButton.tsx / FeedbackModal.tsx # ÚJ
  FeedbackContext.tsx                   # ÚJ — useReportFeedbackContext + a modál olvasó oldala

src/client/shell/
  RootLayout.tsx                        # ÚJ — layout-route, FeedbackButton + FeedbackContext.Provider
  routes.tsx                            # MÓDOSUL — RootLayout bevezetése, LoadingScreen a Suspense-eknél
  gamesRegistry.ts                      # MÓDOSUL — theme/rules/coverImage új mezők
  HomePage.tsx / .module.css            # ÁTÍRVA — csempe-rács
  GameModeSelectPage.tsx                # MÓDOSUL — "Játékszabály" gomb
  lobby/LobbyPage.tsx / .module.css     # MÓDOSUL — useGameTheme, custom property-alapú színek
  useGameTheme.ts                       # ÚJ — a 2.2 szakasz hookja

src/client/games/hotel/ui/
  hotelTheme.module.css                 # ÚJ — kiemelve HotelGamePage.module.css-ből
  HotelRules.tsx                        # ÚJ

src/client/games/ramses/ui/
  ramsesTheme.module.css                # ÚJ — kiemelve RamsesGamePage.module.css-ből
  RamsesRules.tsx                       # ÚJ

src/client/renderers/grid-2d/
  clusterBTheme.module.css              # KIS KIEGÉSZÍTÉS (implementáció közben derült ki) — --shell-* aliasok
                                         # a meglévő --ground/--surface/stb. tokenekre, hogy a generikus shell-
                                         # fogyasztók (Lobby/GameModeSelectPage/RulesModal/LoadingScreen)
                                         # egységesen --shell-*-ot olvashassanak. Semmi meglévő nem változik.
src/client/games/dama/ui/
  DamaRules.tsx                         # ÚJ

src/shared/games/dama/engine/
  state.ts / reducer.ts                 # MÓDOSUL — MoveLogEntry + log: MoveLogEntry[] (4.2.1)
  reducer.test.ts                       # MÓDOSUL — napló-ellenőrző tesztek

src/shared/games/ramses/engine/
  state.ts / reducer.ts                 # MÓDOSUL — RamsesLogEntry + log: RamsesLogEntry[] (4.2.1)
  reducer.test.ts                       # MÓDOSUL — napló-ellenőrző tesztek

src/server/core/
  feedbackRoutes.ts                     # ÚJ

prisma/schema.prisma                    # MÓDOSUL — FeedbackReport modell + migráció
```

## 8. Eldöntött kérdések

A felhasználóval egyeztetve (2026-07-29), mind a négy fő nyitott pont lezárva:

- [x] **Dobozkép-fájlok** — ELFOGADVA: helyettesítő (monogram) csempével kezdünk (5.2), a valós fotók későbbi egyszerű fájl-cserével kerülnek be.
- [x] **Hibabejelentő tárolása** — ELFOGADVA: Prisma tábla (4.3), nem fájl-alapú napló.
- [x] **Esemény napló Dáma/Ramses-nél** — ELFOGADVA (a nagyobb hatókörű opció): mindhárom motor kap minimális eseménynaplót — lásd a bővített 4.2.1 szakaszt a konkrét `MoveLogEntry`/`RamsesLogEntry` tervvel.
- [x] **Szabály-szövegek forrása** — ELFOGADVA: a meglévő, verbátim spec-szövegekből (pl. hotel-0a-specifikacio.md §2) szerkesztem át játékos-barát formára, a felhasználó a végén nézi át.
- [x] **Ramses kiemelő szín** — ELFOGADVA: tompított türkiz/lápisz-lazuli árnyalat (`#5a9b8e`) — egyetlen érték, nem világos/sötét pár, mert Hotel/Ramses (a B-klaszterrel ellentétben) mindig sötét témájú, nincs saját light móduk, amit követni kellene. A Hotel arany-kiemeléséhez hasonló szerepkörben (cím-szín, gomb, fókusz-keret).
- [x] **`GameModeSelectPage` is felvegye a játék témáját** — ELFOGADVA: igen, a Lobby-val megegyezően.

## 9. Kiegészítés a jóváhagyáskor (2026-07-29)

A felhasználó a terv elolvasása után egy apró, korábban nem szereplő megjelenítési kérést tett a játékválasztóhoz (5.2): **a csempe-rács kapjon egy finom "üveg" hatást** (backdrop-blur + félig áttetsző panel-háttér, ugyanaz a vizuális nyelv, mint a Hotel/Ramses/Lobby-panelek `backdrop-filter: blur(...) saturate(...)` mintája, csak a game-független, semleges palettán) — nem játék-specifikus szín, csak az anyagszerűség (üveg-panel érzés) öröklődik át a csempékre. Beépítve az 5.2 szakaszba.

## 10. Implementáció

**Mind a négy pont, plusz a 2. szakasz közös alapja, IMPLEMENTÁLVA és élő böngészős (Playwright) teszttel ellenőrizve, ugyanazon a napon, mint a terv jóváhagyása (2026-07-29).**

**Közös alap (2. szakasz):** `gamesRegistry.ts` bővítve `theme`/`rules`/`coverImage` mezőkkel, `useGameTheme(gameId)` hook (lusta betöltés, ugyanaz a minta, mint a meglévő `load`). Hotel/Ramses saját `hotelTheme.module.css`/`ramsesTheme.module.css` — a MEGLÉVŐ, kódban már használt színekből kiemelve, egy szín kivételével (lásd alább). Dáma `clusterBTheme.module.css`-e egy kis, tisztán additív kiegészítést kapott: `--shell-*` aliasok a meglévő `--ground`/`--surface`/`--ink`/`--accent`/`--line` tokenekre, hogy a generikus shell-fogyasztók (Lobby, GameModeSelectPage, RulesModal, LoadingScreen, FeedbackModal) egységesen `--shell-*`-ot olvashassák, anélkül hogy a B-klaszter saját oldalai (`GridBoard2D`, `DamaGamePage`, `DamaSetupPage`) bármit észrevennének — ez az egyetlen implementáció közben felmerült, tervben még nem szereplő apró architekturális részlet.

**1. Játékszabály:** `RulesModal` (ui-kit) + `HotelRules.tsx`/`DamaRules.tsx`/`RamsesRules.tsx`, mindhárom a megfelelő spec-dokumentum verbátim szövegéből átszerkesztve, játékos-barát, listás formára (Hotel esetén a per-hotel ártáblázatok tudatosan kimaradtak — azok már a vásárlás-megerősítő modálban megjelennek). `GameModeSelectPage` harmadik gombot kapott, és felveszi a téma-osztályt.

**2. Hibabejelentő:** `RootLayout` (új layout-route, `<Outlet/>`+`FeedbackButton`) minden route fölé kerül. `FeedbackContext` (React Context + `useSyncExternalStore`) — `useReportFeedbackContext(gameId, state)` bekötve mindhárom `GamePage`-be (Ramses esetén a MÁR maszkolt state-et publikálja, ugyanazt, amit a `MaskedRamsesTransport` amúgy is ad). `FeedbackReport` Prisma tábla + `/api/feedback` route, auth OPCIONÁLIS (tudatos eltérés `localGameLogRoutes.ts` szigorúbb, kötelező-auth mintájától — indoklás a route saját doc-kommentjében). **Élesben ellenőrizve mindkét irányban**: menüből küldött jelentés (`gameType`/`contextJson` helyesen `null`) és játékon belülről küldött jelentés (Hotel, `gameType: 'hotel'`, `contextJson` valódi `players`+`log` tartalommal, közvetlenül lekérdezve a Postgres táblából `docker exec ... psql`-lel) — mindkét teszt-sor törölve a táblából ellenőrzés után.

**3. Lobby + játékválasztó:** `LobbyPage` felveszi a `useGameTheme`-et (a wrapper ÉS mindkét saját modálja — `CreateRoomModal`, jelszavas csatlakozás — egy új megosztott `themedModalContent.module.css`-en keresztül). `HomePage` teljesen újraírva: semleges, indigó kiemelésű (`#5b5fc7` világos / `#8b8ff0` sötét) csempe-rács, monogram-helyettesítő csempékkel (valós dobozfotó még nincs a repóban), backdrop-blur "üveg" hatással (9. szakasz szerinti kiegészítés).

**4. Betöltő képernyő:** `LoadingScreen` (ui-kit), `gameId` prop → `useGameTheme`, közepén pulzáló "BETÖLTÉS…" felirat (`prefers-reduced-motion` mellett statikus) — az összes 5 korábbi `<p>Betöltés…</p>` helyén (`routes.tsx` × 4, `GameLoader.tsx` × 1).

**Dáma/Ramses motor-bővítés (4.2.1):** mindkét motor pontosan a tervezett `MoveLogEntry`/`RamsesLogEntry` alakot kapta, egy-egy `log: [...]` mezővel bővítve a state-et. Ramses esetén ez egy ELŐRE NEM LÁTOTT, a tervben nem szereplő extra munkát is jelentett: mivel Ramses-nek már van per-mező `@colyseus/schema` hálózati szinkronja (Ramses-0b), az ÚJ `log` mezőt is be kellett kötni a séma-kódba (`RamsesStateSchema.ts` + `ramsesStateCodec.ts`) — Hotel saját, már bevált mintáját követve (`ArraySchema<string>`, minden bejegyzés JSON-stringify-olva, push-only szinkron). Dáma-nak nincs ilyen sémája (opaque JSON state), ott ez a lépés nem kellett. Mindkét motor `testHelpers.ts`-e és a schema-kódoló smoke teszt (`temp/ramses-schema-codec-smoke-test.ts`) is frissítve/újrafuttatva.

**Implementáció közben talált, tervben nem szereplő apróságok, mind javítva:**
- `GameModeSelectPage`/`LobbyPage` eredeti `.page` div-je `max-width`-öt ÉS a hátteret is ugyanarra az elemre tette — emiatt a téma-háttér csak egy keskeny, középre igazított sávban jelent volna meg, fehér margókkal körülötte. Javítva: a háttér egy teljes szélességű `.page`-re került, a `max-width` egy belső `.content` wrapperre.
- A `FeedbackModal` alapértelmezett (nem-játékon-belüli) állapota kezdetben egyszerű fehér dobozként jelent meg, mert a `--shell-*` CSS változók csak akkor léteznek, ha van aktív játék-kontextus — a `themedModalContent.module.css` fallback-értékei `white`/`inherit` helyett valódi, a HomePage-hez illő semleges sötét/indigó alapértelmezésre cserélve.
- `Modal`-lel kapcsolatos CSS Modules default-export csapda: a `gamesRegistry.ts`-ben `import(...).then((m) => ({ default: m.theme }))` helyesen `m.default.theme`-re javítva — a CSS Modules `.module.css` fájlok kizárólag `default` exportot adnak, nincs névvel ellátott export, amit `m.theme` feltételezett volna (tsc azonnal elkapta).
- `feedbackRoutes.ts`: a Prisma `Json` mező `null`/`undefined` megkülönböztetése (`Prisma.JsonNull` vs. mezőkihagyás) miatt a `contextJson` értékadás finomítva, hogy tsc ne jelezzen típushibát.

**Ellenőrzés:** `tsc --noEmit` mindkét tsconfigra tiszta, `eslint .` 0 hiba (4 figyelmeztetés, mind a kör előtt is létező osztályokból: `HotelGamePage` komplexitás-13, `AuthContext`/`FeedbackContext` react-refresh — utóbbi kettő ugyanaz a Context+hook-fájl minta, ami már `AuthContext.tsx`-nél is elfogadott volt). `vitest run` 218/218 (Dáma +2 új napló-teszt, Ramses 3 meglévő teszt bővítve napló-ellenőrzéssel, mindkét motor `reducer.test.ts`-e). `vite build` sikeres, a téma/szabály-modulok mind saját, apró, külön chunkban jelennek meg (pl. `hotelTheme-*.css`, `DamaRules-*.js`) — megerősítve, hogy egyik játék témája/szabálya sem duzzasztja a másik (vagy a fő) bundle-t. Élő Playwright-ellenőrzés minden ponton: HomePage csempe-rács (üveg hatással), mindhárom játék `GameModeSelectPage`+`RulesModal` kombinációja (helyes téma, görgethető tartalom, X gomb), Hotel Lobby + "Új szoba" modál (téma öröklődik a beágyazott modálba is), hibabejelentés mindkét kontextusban (menü és játékon belül, valós adatbázis-sorral igazolva), és egy gyors regressziós kör Dáma/Ramses helyi módban (lépés utáni konzol-ellenőrzés, nincs végtelen újrarenderelési hurok a `FeedbackContext` bekötése miatt).

**Nem ellenőrizve élesben:** a `LoadingScreen` tényleges vizuális megjelenése (a helyi dev-szerver mellett a lusta betöltés túl gyors ahhoz, hogy a Playwright screenshot időben elkapja, ugyanaz a jelenség, mint a régi `<p>Betöltés…</p>` esetén is fennállt) — a kódja/témázása közvetlenül, más, már ellenőrzött komponensekkel (téma-betöltés, pulzáló animáció CSS-e) azonos mintát követ, alacsony kockázatú, nem blokkoló.

## 11. Kiegészítés (2026-07-30): egyedi select/checkbox UI + online kapcsolódási hibaüzenetek — IMPLEMENTÁLVA és élesben ellenőrizve

A Ramses-0d playtest-javítási kör (lásd `ramses-0a-specifikacio.md` §9) közben felmerült két, nem Ramses-specifikus, hanem a teljes shell-réteget érintő hiba.

### 11.1 Natív `<select>`/checkbox lecserélése

**Első kör:** a natív `<select>`/`<input type="checkbox">` elemek (Dáma/Hotel/Ramses saját setup oldalán + a Lobby "Új szoba" moduljában) csak `accent-color`-t (checkbox) és egy háttér/keret-testreszabást (select) kaptak — ez a natív böngésző-widget ALAKJÁT (szögletes checkbox-sarkak, natív lenyíló nyíl) nem tudta megváltoztatni, ami az egyébként teljesen egyedi, lekerekített/üveg-hatású UI mellett zavaróan natívnak hatott.

Új `src/client/ui-kit/FormControls.module.css`.`checkbox` — `appearance: none` + saját, lekerekített, `--shell-accent` színű pipa (`clip-path`), a `--shell-*` tokeneket olvasva (2.3 szakasz), ugyanazzal a fallback-lánccal, mint `Button.module.css`.

**Második kör, ugyanaznap:** kiderült, hogy egy natív `<select>` OPEN (lenyílt) állapota böngésző-függetlenül NEM stílusozható CSS-ből — a fenti kezelés csak a ZÁRT dobozt tudta testreszabni, a lenyíló lista natív maradt. Emiatt a select is lecserélődött egy teljesen egyedi (nem natív) komponensre:

- Új `src/client/ui-kit/Select.tsx` + `Select.module.css` — egy gomb (a záró állapot, saját chevron-ikonnal) + egy `document.body`-ba portalolt, `position: fixed`-del pozicionált lista (ugyanaz a "kerüld el az ős elemek clipping/containing-block csapdáit" minta, mint `Modal.tsx`-nél, szükséges, mert egy `Select` egy Modal BELSEJÉBŐL is nyílhat — pl. Lobby "Új szoba" — aminek saját `.body`-ja görgethető, egy naiv `position: absolute` panelt levágna). Mivel a portalolt panel a DOM-fában KÍVÜL esik az eredeti témázott ősökön, a `--shell-*` tokenek értékeit a trigger gombról olvassa ki (`getComputedStyle`) és írja rá explicit inline stílusként a panelre, hogy a téma öröklés hiányában is helyesen jelenjen meg.
- Lecserélve mind a 6 helyen (Dáma/Hotel/Ramses saját nehézség-választója + Lobby 3 selectje).
- `FormControls.module.css`-ből a natív-select szabályok törölve (csak a `.checkbox` maradt).

### 11.2 Online kapcsolódási hibaüzenetek fordítása + navigáció

A `useOnlineGameRoom.ts` hook egy sikertelen `create`/`join`/`reconnect` esetén a Colyseus kliens SAJÁT, angol hibaüzenetét (`err.message`, pl. `"room \"xyz\" not found"` egy törölt/lejárt szobánál) mutatta a felhasználónak, fordítás nélkül — emellett az ezt megjelenítő `*OnlineGamePage.tsx` képernyők egyikén sem volt kilépési lehetőség (`MenuNav`), csak a böngésző vissza-gombja.

**Javítás:** `translateConnectionError(err)` — a jól ismert, gyakori "szoba nem található" esetet (`/not found/i` illesztéssel) magyarra fordítja ("A szoba már nem érhető el — lehet, hogy törölték, vagy lejárt."), minden más esetben a már meglévő, generikus magyar üzenetre esik vissza (sosem jut ki nyers angol szöveg a képernyőre). Mind a három `*OnlineGamePage.tsx` (Dáma/Hotel/Ramses) hibaüzenet-ága kapott egy `<MenuNav backTo="/games/{gameId}/lobby" />`-t, a lobbyba visszavezető "Vissza"/"Főmenü" gombpárral.

**Ellenőrzés:** `tsc`/`eslint`/`vitest` mind tiszta; a select/checkbox cserét élő Playwright-teszt igazolta (Dáma világos + Ramses/Hotel sötét témában is helyesen jelenik meg a lenyíló panel); a kapcsolódási hiba + `MenuNav` javítást a `RamsesForfeitControl`/multiplayer teszt közben, két valódi kliens közötti manuális próbával igazoltam.
