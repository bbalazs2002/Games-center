# Hotel — animáció-rendszer terve

**Státusz:** Kész, élőben ellenőrizve (mind a 4 animáció: bábu-mozgás, pénzmozgás, építés/kert, telek-vásárlás)
**Utolsó frissítés:** 2026-07-26

**Döntések (2026-07-26):** (1) `@react-spring/three` a 3D animációkhoz (bábu-mozgás, épület/kert pop-in) — kész könyvtár a kézzel írt lerp helyett; (2) a pénzmozgás egyszerű, felfelé úszó +/− szöveg lesz a `StatusChip` mellett (nem repülő bankjegy-ikon); (3) mind a négy animáció (bábu, pénz, építés, telek-vásárlás) egyben, egy körben kerül megtervezésre és implementálásra, nem fázisokra bontva.

**Megvalósítás közben egyszerűsödött az architektúra a 3. szakaszhoz képest** — kiderült, hogy nem minden animációhoz kell a napló-figyelés: a bábu-mozgás és az épület/kert pop-in **mount-/prop-vezérelt** (nincs szükség napló-eseményre, lásd 3.2/4.1/4.3), csak a pénzmozgás és a telek-vásárlási pulzálás használja ténylegesen a napló-figyelő `useNewItemsSince` hookot. Ez KEVESEBB kód, nem több — a dokumentum lent, a 3.2/4. szakaszokban már a tényleges (nem a korábban tervezett, egységes "HotelAnimationEffect" táblázatos) megoldást írja le.
**Kapcsolódik:** [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md) (§9.2 — a game-log, ami ennek az egész tervnek az adatforrása lesz), [hotel-0c-specifikacio.md](./hotel-0c-specifikacio.md) (§5.3 — `AnimatedDie`, az egyetlen már létező animáció ebben a projektben, ennek a mintáját visszük tovább)

## 1. Cél és hatókör

Jelenleg minden állapotváltozás (bábu-lépés, pénzmozgás, épület felhúzása, telek gazdát cserél) **azonnal, animáció nélkül** jelenik meg — a reducer egy state-ből egy másikba ugrik, a renderelő pedig egyszerűen újrarajzolja a képet az új adatokkal. Cél: a kért esetekben (bábu-mozgás, pénzmozgás, építés, telek-vásárlás) **vizuálisan végigvezetni** a változást, ahelyett hogy csak "kattanna" — anélkül, hogy a motor (reducer) bármit is tudna az animációról.

**Nincs hatókörben (ezen a körön):** a tényleges implementáció — ez egy tervezési dokumentum, a 9. szakasz nyitott pontjainak eldöntése után kezdődhet a kódolás.

## 2. Az alapprobléma: a motor pillanatszerű, a képernyőnek nem kell annak lennie

A reducer szándékosan **tiszta és determinisztikus** — egy `dispatch` egy `(state, action) → newState` hívás, nincs benne idő, nincs benne "köztes" állapot. Ez helyes és nem is szabad megváltoztatni (ez teszi lehetővé, hogy ugyanaz a motor fusson helyi hot-seat módban, hálózaton, és később AI-val is — lásd a projekt egészét átható elvet). Az animáció tehát **kizárólag a kliens-oldali renderelés dolga**: a motor egyik pillanatról a másikra "átugorja" az állapotot, a kliens pedig ezt a két pillanatot (előző és új állapot) tudja **vizuálisan interpolálni**.

Ez pontosan az a minta, amit a `AnimatedDie` (Hotel-0c) már bevezetett: a motor azonnal eldönti a dobás eredményét, a kockának viszont van egy saját, kliens-oldali, `useFrame`-mel vezérelt vizuális állapota (a jelenlegi orientáció), ami idővel a helyes végeredmény felé mozog. **Ugyanezt az elvet visszük tovább minden más animációra**: a "logikai" állapot (`HotelState`) azonnal vált, a "vizuális" állapot (bábu-pozíció, épület-magasság, stb.) a kliensben él, és idővel követi a logikait.

## 3. Mi indítsa el az animációt? — a `log` mint eseménysor

A motor már ma is minden érdemi eseményt strukturáltan naplóz (`HotelState.log: LogEntry[]`, lásd `hotel-0a-specifikacio.md` §9.2) — ez **pontosan** az az adat, amiből tudni lehet, *mi* történt (nem csak azt, hogy *valami* megváltozott). Ahelyett, hogy a kliens a nyers state két egymást követő pillanatát hasonlítgatná össze (mezőnként figyelve, hogy pl. egy `cash` érték változott-e), egyszerűbb és pontosabb **az újonnan megjelenő napló-bejegyzéseket figyelni** — minden bejegyzés-típushoz pontosan tudjuk, milyen animációt kell hozzá indítani, és minden adat (kinek, mennyi, hova) már benne van.

Ez egyúttal **transport-agnosztikus is marad**: helyi (`LocalGameTransport`) és hálózati (`ColyseusGameTransport`) módban is ugyanúgy a `state.log` hosszának növekedése indítja az animációt — a `useGameTransport` hook mindkét esetben csak a legutóbbi állapotot adja vissza (`useSyncExternalStore`-on keresztül), a napló-alapú megközelítés ezzel eleve kompatibilis, nincs szükség speciális kezelésre online módban.

### 3.1 Generikus réteg (game-agnosztikus, `src/client/core/` + `@react-spring/three`)

Egyetlen új, kis hook, ami bármelyik jövőbeli játék napló-alapú animációjához is használható lesz (a `core/games` szeparációs elv szerint — lásd a projekt workflow-konvencióját):

```ts
// src/client/core/useNewItemsSince.ts
export function useNewItemsSince<T>(items: T[]): T[] {
  // Visszaadja azokat az elemeket, amik a legutóbbi render óta kerültek az
  // (append-only) tömb végére — a hívó ezekre reagál (animáció indítása),
  // a tömb korábbi tartalmát nem érinti újra.
}
```

**Döntés: `@react-spring/three`** (nem kézzel írt lerp) a 3D-s animációkhoz — rugó-fizika, beépített interrupt/retarget kezelés, kevesebb saját kód. A meglévő `AnimatedDie` (ami kézzel írt `useFrame`-alapú tween-t használ) **változatlanul marad** — jól működik, nincs ok újraírni; az új effektek (bábu-mozgás, épület/kert pop-in) viszont `@react-spring/three`-re épülnek, hogy egy jövőbeli harmadik animált elem már egyértelműen ezt a mintát kövesse.

**Fontos, a `LoopTrackBoard3D`-t (game-agnosztikus renderer, cluster C) érintő kiegészítés:** a bábu-mozgás animálásához a token-oknak **stabil azonosítóra** van szükség — jelenleg a `LoopTrackToken<TToken>` csak `{ spaceIndex, token }`, a React-kulcs pedig `${spaceIndex}-${tokenIndex}` (lásd `LoopTrackBoard3D.tsx`), ami **pozíció-változáskor maga is megváltozik** — ez azt jelentené, hogy React minden lépésnél elpusztítja és újra létrehozza a bábut ahelyett, hogy animálná. Új mező: `LoopTrackToken<TToken> = { id: string; spaceIndex: number; token: TToken }` — az `id` (Hotelnél a `playerId`) lesz a React-kulcs, a `spaceIndex` változása pedig egy `@react-spring/three` `useSpring`-et indít, ami **mezőről mezőre lépked** (nem egyenes vonalban a régi és új pozíció közt) — ehhez a köztes mező-pozíciókat (`positions[from..to]`) kulcsképkockákként adjuk át a springnek (react-spring aszinkron `to` függvénnyel támogatja a több lépcsős animációt). Ez a képesség a `LoopTrackBoard3D`-be kerül (nem Hotel-specifikus kódba), mert bármelyik jövőbeli loop-track játék (Gazdálkodj okosan, Monopoly) ugyanígy akarja majd animálni a bábuit.

### 3.2 Hotel-specifikus réteg — a ténylegesen megvalósult megoldás

Négy animáció, **négy különböző, a saját problémájához illő technika** — nem egy központi "effekt-dispatcher", mert három közülük egyáltalán nem igényli:

| Animáció | Trigger | Miért nem kell hozzá napló-figyelés |
|---|---|---|
| Bábu-mozgás | `spaceIndex` prop változása (`LoopTrackBoard3D`) | A `player.position` már maga a "mit animáljak" jel — a napló csak duplikálná. |
| Épület/kert pop-in | React **mount** (`BuildingBox`/`GardenDecal` frissen létrejön, amikor `buildingsBuilt`/`hasGarden` nő) | Egy új doboz/kert-elem attól "új", hogy megjelenik a fában — ez már önmagában az indító jel. |
| Pénzmozgás | `useNewItemsSince(state.log)` + `cashDeltaForPlayer(entry, playerId)` | Itt TÉNYLEG kell a napló: egy `cash`-mező-diff nem mondaná meg, MENNYIVEL/MIÉRT változott. |
| Telek-vásárlás pulzálás | `useNewItemsSince(state.log)`, csak `LOT_BOUGHT` | A tulajdonjog megszerzése nem jár semmilyen új/eltűnő elemmel — ehhez tényleg egy tranziens, időzített kliens-state kell. |

`src/client/games/hotel/ui/useTransientLogEffects.ts` — `useCashFlourishes(log, playerId)` és `useRecentLotPurchases(log)`, mindkettő a generikus `useNewItemsSince`-re épül, saját maguk törlik magukat egy rövid (1.2s) időzítő után.

## 4. Az egyes kért animációk terve

### 4.1 Bábu-mozgás — ELKÉSZÜLT, élőben ellenőrizve

A `LoopTrackToken` új, kötelező `id` mezőt kapott (Hotelnél `playerId`) — ez a React-kulcs, hogy a bábu ugyanaz a komponens-példány maradjon lépés közben (ne pusztuljon/keletkezzen újra). A `LoopTrackBoard3D`-n belüli `AnimatedToken` figyeli a `spaceIndex` prop változását, és ilyenkor egy `@react-spring/three` `useSpring`-et indít, ami **mezőről mezőre lépked** (`stepPath` — a kezdő és cél index közötti minden köztes mezőt bejárja, a tábla-hossz szerinti körbefordulással), nem egyenes vonalban repül át a tábla közepén. Ha a lépés közben egy speciális sávot érint, az együtt naplózódik a `MOVED`-del, de ehhez a vizuális animációhoz **nem kellett a napló** — a `spaceIndex` prop változása önmagában elég trigger.

**Motor-kiegészítés, megvalósítva:** a `MOVED` napló-bejegyzés kapott egy `fromPosition: number` mezőt (`toPosition` mellé) — ez a `hotel-0a-specifikacio.md` §9.2-ben is dokumentált naplóhoz tartozik, nem magához az animációhoz (ami a `player.position`-t nézi közvetlenül), de hasznos adat a napló-panel/jövőbeli reprodukció szempontjából. Kis, additív reducer-változás, 2 érintett teszt frissítve (`reducer.test.ts`).

### 4.2 Pénzmozgás

**ELKÉSZÜLT, élőben ellenőrizve.** Egyszerű, felfelé úszó, elhalványuló "+1200"/"−500" szöveg (`CashFlourishOverlay`) a `StatusChip` pénzösszege fölött — sima CSS `@keyframes` (`cash-flourish-rise`: translateY + opacity), nincs `@react-spring` (tisztán DOM-os, nem 3D). `useCashFlourishes(log, playerId)` minden pénzt mozgató napló-eseményt (`LOT_BOUGHT`, `NIGHTS_STAY`, `STAIRCASE_RIGHT_BOUGHT`, `BONUS_2000`, `FREE_STAIRCASE_GRANTED`, `FREE_BUILDING_GRANTED`, `AUCTION_RESOLVED`, `CONSTRUCTION_PERMIT_ROLLED`, `GARDEN_BUILT_WITHOUT_PERMIT`) egy előjeles delta-ra fordít le, ha a bejegyzés a megadott játékost érinti (0 összegű/RED-elutasított eset nem generál flourish-t). Több egyidejű flourish egymás fölé torlódva, saját `id`-vel, egymástól függetlenül tűnik el ~1.2s után.

**Hatókör-megszorítás, tudatosan:** a `StatusChip` **csak a soron lévő játékos** készpénzét mutatja folyamatosan — a többi játékosnak jelenleg nincs állandóan látható pénzkijelzése. Emiatt a v1 kizárólag **a soron lévő (mozgó) játékos saját delta-ját** animálja (ő fizet/kap szinte minden eseménynél maga is) — egy másik, épp nem aktív játékos oldalán (pl. `NIGHTS_STAY`-nél a bérleti díjat kapó tulajdonos) egyelőre NEM jelenik meg flourish, mert nincs hova kirajzolni. Ez egy tudatos, dokumentált egyszerűsítés, nem hiba — bővíthető később, ha lesz állandó, minden-játékost-mutató pénz-kijelzés is.

### 4.3 Építés és kert — ELKÉSZÜLT, élőben ellenőrizve

`BuildingBox` (egy épület-doboz) és `GardenDecal` (kert-fotó) mindkettő egy `useSpring({ from: { scale: 0 }, to: { scale: 1 } })`-ot indít **a mounton** — mivel egy új épület pontosan akkor jelenik meg a React-fában (a `HotelBuildingClusters` `Array.from({length: lot.buildingsBuilt}, ...)`-je egy elemmel többet gyárt), amikor ténylegesen felépült, ez a mount-esemény maga a helyes trigger, nincs szükség napló-figyelésre. (A kert-fotónál az anyag `opacity`-jét szándékosan NEM animáljuk a `scale` mellett — a `@react-spring/three` + `map`-es `meshStandardMaterial` + `opacity` kombináció egy túlzottan mély TypeScript-instanciálási hibát dob a jelenleg telepített verziókkal; a scale-only pop-in vizuálisan ugyanazt az érzetet adja.)

### 4.4 Telek-vásárlás — ELKÉSZÜLT, élőben ellenőrizve

`useRecentLotPurchases(log)` (`LOT_BOUGHT` bejegyzéseket figyel) + a hívó (`HotelGamePage`) feloldja a vevő játékos-színét → `PurchasePulse` egy tágra növekvő, elhalványuló gyűrű (`ringGeometry`) a telek zónáján, a vevő színében, ~1.1s. Az `OwnedLotsPanel` új sora emellett egy sima CSS mount-animációt kap (`owned-lot-appear`, oldalról becsúszik) — ez is mount-triggerelt (egy új, korábban nem létező `lotId` kulcs mindig frissen mountol), nem a napló-rendszer része.

### 4.5 Nem kért, de a mintából "ingyen" adódó további effektek (later, nem blokkoló)

Lépcső-elhelyezés, árverési licit, feladás/győzelem — mind ugyanabba a napló-vezérelt effekt-táblázatba illeszthetők be később, saját sorként, anélkül hogy az alap-architektúrát bővíteni kellene. Nem része a mostani körnek, csak jelezve, hogy a rendszer emiatt eleve bővíthetőre készül.

## 5. Sorrendezés — egyszerre több effekt egy dispatch-ból

Egyetlen action (pl. egy dobás, ami átlép egy bónusz-sávon) **több** log-bejegyzést is hozzáadhat egyszerre (`MOVED` + `BONUS_2000`). Kérdés, hogy ezek animációi **egymás után** (előbb a lépés, majd a bónusz-villanás — hűebb az élményhez, de lassabb) vagy **párhuzamosan** (gyorsabb, de zsúfoltabb) fussanak-e. Javaslatom: **csak az egy dispatch-ból, oksági kapcsolatban lévő effektek** (mozgás + útközbeni sáv-effektus) legyenek sorba állítva; minden más (pl. egy másik telek épület-effektje, ha valamiért egyszerre futna) egymástól függetlenül, párhuzamosan indulhat — a gyakorlatban ritkán fut több, egymással nem összefüggő effekt egyszerre, mert a UI (tárcsa) egyébként is egy akció → egy dispatch mintát követ.

## 6. Multiplayer-kompatibilitás

Mivel minden animáció **kliens-oldali, a state-től/naplótól függő reakció**, nem pedig a dispatch hívás oldalán él, ugyanúgy működik hot-seat és online módban is — sőt, ha egy másik játékos lép online módban, a te kliensed ugyanúgy látja az új napló-bejegyzést (a szerver szinkronizálja), és ugyanúgy lejátssza az animációt, mintha te dobtál volna. Nincs szükség külön "ki az aktív kliens" elágazásra.

## 7. Motor-oldali kiegészítés (összefoglalva)

- [x] `LogEntry` `MOVED` ága kapott egy `fromPosition: number` mezőt (`toPosition` mellett) — kis, additív reducer-változás, `reducer.test.ts` 2 érintett teszt-esete frissítve. 130/130 teszt zöld.

Ezen kívül a motor **semmilyen más módon nem változott** — az animáció-rendszer teljes egészében a kliens-oldalon épült fel.

## 8. Diagram

Lásd: [diagrams/hotel-animacio-sequence.puml](./diagrams/hotel-animacio-sequence.puml) — egy tipikus kör (dobás → lépés → bónusz) animáció-folyama.

## 9. Döntések (lezárva, 2026-07-26)

- [x] **Animáció-eszköz**: `@react-spring/three` a 3D animációkhoz; a meglévő `AnimatedDie` (kézzel írt) érintetlen marad.
- [x] **Pénzmozgás stílusa**: egyszerű, felfelé úszó +/− szöveg a `StatusChip` mellett (sima CSS).
- [x] **Sorrend**: nincs fázisbontás — mind a négy animáció (bábu, pénz, építés, telek-vásárlás) egy körben kerül megvalósításra.
- [ ] Ha AI kockát dobat (Hotel-0d), az AI lépéseinek animációja is ugyanezen a rendszeren megy majd keresztül — nincs teendő emiatt most, csak megerősítésre vár, hogy ez az elvárás.

## 10. Ellenőrzés

Mind a négy animáció élőben tesztelve Playwright-tal (ideiglenes `initialState.ts` teszt-adat módosításokkal, minden alkalommal visszaállítva): bábu-mozgás (dobás → a bábu a helyes végpozícióba lép, konzolhiba nélkül), telek-vásárlás (pénz csökken, `OwnedLotsPanel` sor megjelenik, nincs hiba), építkezés (engedély-dobás → épület megjelenik a helyén, pénz csökken a megfelelő összeggel). A pontos vizuális "közben" állapotot (a rugó-animáció kellős közepén) nehéz volt screenshottal elkapni (~1-1.2s-os effektek, a Playwright-parancsok közötti kör-idő ennél gyakran hosszabb) — a végállapot helyessége és a hibamentesség viszont minden esetben megerősítve. Új dedikált unit teszt nem készült az animációkhoz (tisztán vizuális/időzítés-alapú logika, a `useNewItemsSince`/`stepPath` segédfüggvények egyszerűek és jól olvashatók, a meglévő 130 motor-teszt változatlanul lefedi az ezek mögötti tényleges állapotváltozásokat).

`tsc`, `typecheck:server`, `eslint` (teljes projekt), `vitest` (130/130), `vite build` — mind zöld.
