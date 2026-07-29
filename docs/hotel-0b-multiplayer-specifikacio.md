# Hotel-0b — Specifikáció: multiplayer réteg

**Státusz: IMPLEMENTÁLVA (2026-07-24), élő böngészős tesztre vár.** Minden architekturális döntés (5., 5.1. szakasz) megvalósítva és élesben (valódi szerver + Postgres + 3 valódi Colyseus-kliens) ellenőrizve — lásd 9. szakasz.

## 1. Cél és hatókör

A Hotel-0a (helyi hot-seat vertikum) lezárva, hibát a manuális tesztelés már nem talált. A Hotel-0b feladata a `docs/Projekt-conception.md`-ben korábban rögzített hatókör:

- A `GameRoom` (`src/server/core/GameRoom.ts`) N-fős (2-4) Hotel-játékra való felkészítése.
- A Fázis 0c-ben megépült szoba-jelszó/láthatóság/csatlakozási-kérelem rendszer élesben tesztelve 3+ fővel is (ez a rendszer már eleve game-agnosztikus a `GameRoom` alaposztályban, tehát elvileg készen áll — a valódi kérdés, hogy N-fős kontextusban minden feltevése megállja-e a helyét).
- A mezőnkénti `@colyseus/schema`-refaktor kérdése (lásd 5. szakasz) — **eredetileg csak egy jövőbeli emlékeztető volt**, Hotel-0b-re időzítve; most, hogy a Hotel-0a-ban bekerült egy korlátlanul növekvő `log: LogEntry[]` mező, ez már nem elméleti probléma.
- AI-ellenfél **nem** ebbe a fázisba tartozik — az Hotel-0d, itt (Hotel-0b) csak emberi játékosok közötti hálózati játék a cél, ugyanúgy, ahogy Fázis 0b (Dáma) is AI nélkül indult.

Ez a dokumentum a Hotel-0a és a korábbi Dáma-multiplayer (`dama-0b-multiplayer-specifikacio.md`, `dama-0c-ai-specifikacio.md`) dokumentumok mintáját követi: előbb a tényleges kódból (nem feltételezésekből) levezetett elemzés, utána a nyitott pontok, majd — azok lezárása után — az implementáció.

## 2. Amit a Dáma multiplayer-rétege már megold, változtatás nélkül örökölhető

A `GameRoom<TState, TAction, TPlayerSlot extends string = string>` (`src/server/core/GameRoom.ts`) alaposztály forráskódjának friss átolvasása alapján ezek **már ma is game-agnosztikusak**, tehát Hotelre nézve elvileg semmilyen módosítást nem igényelnek:

- Auth (JWT), a `GameSession`/`GameSessionPlayer` Prisma-modell (`playerSlot` már ma is sima `String`, nincs 2-elemű enumra kötve — DB-oldalon nulla módosítás kell).
- Szoba-jelszó (`roomPassword`), láthatóság (`setMetadata({hasPassword})`, `setPrivate` csak kapacitás miatt), csatlakozási kérelem (`pendingRequests`, `respondToJoinRequest`) — mind a `GameRoom` szintjén, `TPlayerSlot`-tól függetlenül.
- Újracsatlakozás (`allowReconnection`, `yourSlot` újraküldése) — szintén slot-agnosztikus.
- `ColyseusGameTransport` (kliens) — `TState`/`TAction` generikus, semmit nem tud a játék belsejéről.
- `LocalGameTransport`/`GameTransport` interfész — érintetlen, a hot-seat mód ezután is ugyanígy működik.

**Fontos, kód-alapú pontosítás a korábbi (Projekt-conception.md-beli) megfogalmazáshoz képest:** a `GameRoom` **alaposztálya** nincs 2 szereplőre hardcode-olva — a `TPlayerSlot` már ma is generikus típusparaméter, és `assignPlayerSlot(joinIndex)` bármennyi slotot ki tud osztani. Ami ténylegesen 2-re van kötve, az a **`DamaRoom`** (`maxClients = 2`, `Player = 'LIGHT' | 'DARK'`) — ez Dáma-specifikus, nem a közös alaposztály korlátja. A Hotel-0b tehát nem a `GameRoom` "N-fősre alakítását" igényli az eredetileg feltételezett értelemben, hanem néhány pontosabb, alább részletezett kiegészítést.

## 3. Amit ténylegesen módosítani/bővíteni kell — konkrét, kód-alapú megállapítások

### 3.1 `maxClients` dinamikussá tétele

`DamaRoom.maxClients = 2` egy fix osztály-mező. Hotelnél a játékosszám (2-4) a szoba **létrehozásakor** dől el, játékosonként változó — tehát a `HotelRoom`-nak az `onCreate(options)`-ben kapott `options.playerCount`-ból kell beállítania `this.maxClients`-t, nem class-mezőként. (A Colyseus natívan támogatja a `maxClients` `onCreate`-en belüli beállítását — implementáció közben ellenőrizendő, de nincs ismert akadálya.)

### 3.2 Az árverés licit/passz kivétele nem fér bele a jelenlegi `isPlayersTurn(state, slot)` szerződésbe

A `GameRoom`-ban a szabály-érvényesítés két rétegű (`dama-0b-multiplayer-specifikacio.md` §6.3): `isValidAction` (alak-ellenőrzés) + `isPlayersTurn(state, slot)` (a küldő kliens slotja egyezik-e azzal, aki éppen léphet). Ez a második réteg **hallgatólagosan feltételezi**, hogy egy adott pillanatban legfeljebb EGY slot jogosult action-t küldeni (`state.currentPlayerIndex`-typusú koncepció) — ez Dámánál igaz, Hotelnél **nem**: `PLACE_BID`/`PASS_BID` bármelyik, még nem passzolt, nem-kiváltó játékostól jöhet (`docs/hotel-0a-specifikacio.md` §9.1, ezért kapott a `HotelAction` explicit `bidderId` mezőt). A motor ezt már a reducer szintjén helyesen kezeli (`canPlaceBid`/`canPassBid` a `bidderId`-t ellenőrzi, nem a soron lévő játékost) — de a `GameRoom`-nak is tudnia kell validálni, hogy **a küldő kliens tényleg a saját `bidderId`-jével** licitál-e/passzol-e, ne tudjon más nevében beavatkozni.

Ez azt jelenti, hogy a `isPlayersTurn(state, slot): boolean` szerződés Hotelnél nem elég — a döntéshez ismerni kell magát az action-t is (legalább annyit, hogy kinek a nevében szól). **Eldőlt (5.1/4. és 6.4. szakasz):** a `GameRoom` közös abstract szerződése cserélődik `isActionAllowed(state, slot, action): boolean`-ra — nem `HotelRoom`-szintű különmegoldás.

### 3.3 `LobbyPage` "Új szoba" modal — hiányzik a játékosszám-választó

A jelenlegi `LobbyPage.tsx` létrehozás-modalja kizárólag "Ember vagy AI" választást kínál egyetlen ellenfélre — implicit 2 fős feltevéssel. Hotelnél (AI nélkül, 2-4 emberi játékossal) ehelyett egy játékosszám-választó kell (2/3/4), amit a szoba-létrehozó `create()`-hívás `options`-be küld (`playerCount`), a `HotelRoom.onCreate` ebből állítja be a `maxClients`-t (lásd 3.1). Ez a modal jelenleg game-agnosztikus KÓD, de Dáma-specifikus FELTEVÉSEKKEL — a `GAMES_REGISTRY`-ben már van egyfajta per-game leírás (`label`, `load`), érdemes megvizsgálni, hogy a "milyen létrehozási opciókat kínáljon a modal" is onnan jöjjön-e (pl. egy `roomCreationOptions` mező a regisztrációs bejegyzésen), vagy egyelőre elég egy egyszerű `gameId === 'hotel'` elágazás — ez implementációs részletkérdés, nem architektúra.

### 3.4 `HotelGamePage` nem tudja fogadni a hálózati transportot

A `DamaGamePage` már ma is elfogad egy opcionális `transport`/`myPlayer` propot (hot-seat esetén hiányzik, online esetén a `DamaOnlineGamePage` adja át) — a `HotelGamePage` jelenleg MINDIG saját maga építi a `LocalGameTransport`-ot, nincs ilyen prop. Ezt Hotel-0b-ben ugyanígy be kell vezetni.

**Kérdés, amit érdemes tisztázni (lásd 6. szakasz):** Dámánál a `myPlayer` (LIGHT/DARK) elsősorban azt dönti el, hogy a UI éppen kinek a szemszögéből jelenítse meg a táblát/vezérlőket. Hotelnél a `PlayerActionWheel` már ma is mindig a `state.currentPlayerIndex`-hez kötött (hot-seat: "aki éppen jön, az nyúl a telefonhoz/gephez") — online módban ez át kell, hogy alakuljon "a tárcsa csak akkor aktív/interaktív, ha `myPlayer === currentPlayer`" logikára, a többi játékos nézetében a tárcsa inaktív/rejtett legyen. Ez UI-viselkedési döntés, nem csak egy prop-átadás.

### 3.5 `DamaOnlineGamePage` mintája: megosztani vagy duplikálni?

A `DamaOnlineGamePage.tsx` kódja explicit megjegyzésben mondja ki: *"Dáma-specific for now (not a generic MultiplayerGameLoader) — deliberately not generalized yet, while there's only one multiplayer-capable game (...) only worth factoring out once a second game genuinely needs the same thing."* A Hotel-0b pontosan ez a második játék — tehát ez a küszöb most lép életbe. A fájl kb. 250 sorából a túlnyomó többség (kapcsolódás, jelszó/kérelem UI, újracsatlakozás-token kezelés, `awaitingApproval`/`rejectedReason`/`opponentStatus` állapotgép) **teljesen game-agnosztikus** — csak a `DamaAction`/`DamaState` típusok, a `createInitialState()` hívás, és a végén renderelt `<DamaGamePage>` maga Dáma-specifikus.

### 3.6 A mezőnkénti `@colyseus/schema`-refaktor — most már konkrét ok van rá

`dama-0b-multiplayer-specifikacio.md` §6.1 ezt eredetileg elméleti, jövőbeli problémaként írta le ("ha egy komplexebb/nagy state-ű játék... igényelne"). A Hotel-0a azóta bevezetett egy **korlátlanul növekvő** `log: LogEntry[]` mezőt (a napló-panelhez) — az opaque-JSON modell mellett ez azt jelenti, hogy **minden egyes action után a teljes eddigi naplót újraküldi** a szerver minden kliensnek, a játék előrehaladtával egyre nagyobb payloaddal (egy hosszú Hotel-parti könnyen 100+ log-bejegyzést termelhet, mindegyik lot-/player-id-kel és összegekkel). Ez nem feltétlenül blokkoló egy családi, alkalmi célú appnál, de már nem pusztán elméleti. **Eldőlt (5. szakasz, 2. döntés):** most, Hotel-0b részeként megcsináljuk a teljes mezőnkénti refaktort — nem "majd egyszer" félretéve.

## 4. Amit ez a dokumentum (egyelőre) NEM dönt el

Az alábbi, korábban már lezárt Dáma-minták változatlanul öröklődnek, amíg az 5. szakasz nyitott pontjai másképp nem döntenek:

- Perzisztencia (forró út = `GameRoom` memória, hideg út = időzített Prisma flush) — semmi Hotel-specifikus ok nincs ezt megváltoztatni.
- Reconnection (`allowReconnection`) — N szereplőnél ugyanúgy működik, csak `TPlayerSlot`-tól függetlenül. **Az ablak hossza viszont változik, lásd 5.1/1.**
- Anti-cheat két rétege (`isValidAction` alak-ellenőrzés + a 3.2-ben tárgyalt küldő-azonosítás) — az elv marad, csak a második réteg mélyül.

## 5. Döntések (2026-07-24, első kör)

Mind a négy, 5. szakaszban feltett nyitott pont eldőlt:

1. **`GameRoom`-szintű, action-tudatos validáció.** A közös `GameRoom` absztrakció bővül — nem `HotelRoom`-szintű különmegoldás. Konkrétan: `isPlayersTurn(state, slot): boolean` helyett/mellett egy action-tudatos ellenőrzés kerül az alaposztályba (pontos szignatúra: 6.4 szakasz), amit minden jövőbeli, "nem csak a soron lévő játékos léphet" mechanikájú játék (pl. egy kártyajáték, ahol többen reagálhatnak egy eseményre) újrahasznosíthat. `DamaRoom`-nál ez visszavezethető a jelenlegi, egyszerű "a küldő slotja == currentPlayer" ellenőrzésre — tehát **nem viselkedés-változás Dámánál**, csak a szerződés általánosítása.
2. **Teljes mezőnkénti `@colyseus/schema`-refaktor — most, Hotel-0b részeként.** Nem a könnyebb, "a log kimarad a szinkronból" megoldás — a `HotelState` egésze mezőnkénti Schema-ként lesz leírva, valódi bináris diff-szinkronizációval. Ez a döntés messze a legnagyobb hatású a négy közül — a technikai vázlatot lásd a 6. szakaszban, mert több, eddig fel nem merült tervezési kérdést vet fel (pl. hogyan reprezentáljuk a `LogEntry` uniót, ami `@colyseus/schema`-ban nem natívan támogatott fogalom).
3. **`DamaOnlineGamePage` közös komponensbe/hookba emelése.** Dáma is átáll rá — nem duplikátum `HotelOnlineGamePage`. A közös réteg neve/API-ja még nyitott (7. szakasz, 2. pont).
4. **Online UI-nézet: nyílt információ, tárcsa csak saját körben aktív.** Minden játékos ugyanazt a táblát/naplót/telek-listákat látja (a fizikai játékkal egyezően), a `PlayerActionWheel` csak akkor interaktív, ha `myPlayer === currentPlayer` — máskor inaktív/szürkített, de látható. Nincs rejtett információ egyik játékos elől sem.

## 5.1 Kiegészítő döntések és pontosítások (második kör, 2026-07-24, a te visszajelzésed alapján)

**1. Reconnection-ablak 120 mp → 300 mp (5 perc).** A `GameRoom.RECONNECTION_WINDOW_SECONDS` konstans (jelenleg `120`) `300`-ra változik. Ez a `GameRoom` KÖZÖS konstansa, nem game-specifikus — a változtatás Dámára is vonatkozik (a kód eredeti kommentje már most is "generous on purpose... casual family app, not competitive" elven indokolja a hosszú ablakot, az 5 perc ugyanezt az elvet viszi tovább, nincs ok Hotelre külön értéket tartani).

**2. Időszakos teljes-állapot lekérdezés a mezőnkénti diff biztosítékaként.** Jogos aggály: a mezőnkénti Schema-szinkron elméletileg sebezhető egy elveszett/hibásan alkalmazott delta ellen (bár Colyseus WebSocket/TCP fölött fut, ami önmagában megbízható, sorrendhelyes kézbesítést garantál — a valódi kockázat inkább egy jövőbeli könyvtár-/kódhiba, nem hálózati csomagvesztés). Mivel ez **csak a UI megjelenítését** érintheti (a szerver `gameState`-je marad az egyetlen hiteles forrás, a reducer sosem fut kliens-oldalon), egy olcsó, nem-blokkoló biztosíték elég:

- Új, **game-agnosztikus** üzenetpár a `GameRoom`/`ColyseusGameTransport` szintjén (nem Hotel-specifikus — bármelyik jövőbeli, mezőnkénti Schema-t használó játék örökli): kliens → szerver `room.send('requestFullSync')`, szerver → kliens `client.send('fullSync', JSON.stringify(this.gameState))`.
- A `ColyseusGameTransport` időzítve (pl. 60 másodpercenként, `FULL_SYNC_INTERVAL_MS`) automatikusan küldi a kérést; a válaszra a teljes helyi state-et felülírja és értesíti a listenereket — ugyanaz a mechanizmus, mint kapcsolódáskor/state-change-kor, csak nem a Schema-diffből, hanem egy nyers JSON-ból.
- **Szép mellékhatás:** ez pontosan az eddigi opaque-JSON útvonal (`JSON.stringify(this.gameState)`) újrahasznosítása — a "régi" architektúra nem tűnik el, hanem a "hideg út" mellett egy második, ritkán használt biztonsági szerepet kap. Nincs extra szerializálási logika, amit külön karban kéne tartani.
- Csak a mezőnkénti Schema-t használó játékoknál van értelme (Dáma opaque-JSON-nál minden state-change már eleve teljes resync, tehát nála ez a mechanizmus érdemben redundáns lenne) — de mivel a `ColyseusGameTransport`-ban él, egységesen minden Colyseus-alapú transport örökli, függetlenül attól, hogy az adott játéknak ez ér-e valamit. Ez szándékosan generikus, nem Hotel-specifikus bővítés (lásd 4. pont, "generalizáljunk, ahol lehet").

**3. Egyedi, bájt-szintű szerializáló a JSON helyett — ajánlás: NE ebben a fázisban.** Érdekes technikai kihívás lenne, és **megvalósítható** (egy kompakt, tag+length-prefixelt bináris formátum az action-message-ekhez és a log-bejegyzésekhez nem ördöngösség), de három okból nem javaslom Hotel-0b részének:

- A Colyseus **már ma is bináris protokollt** használ a `@colyseus/schema`-alapú state-szinkronhoz (ez maga a döntés lényege a 6. szakaszban) — a JSON-t tudatosan csak két, eleve ritka/kis méretű helyen tartjuk meg: a `log`-bejegyzések (`ArraySchema<string>` elemenként, csak ÚJ bejegyzéskor megy át) és az 5.1/2. pontbeli időszakos teljes-szinkron (percenként egyszer). Az action-üzenetek (`room.send('action', ...)`) mérete is eleve kicsi (néhány mező, egy dobás/licit/vásárlás), és a Colyseus saját üzenetküldése sem nyers JSON-tküld a hálózaton (a `send`/`onMessage` csatorna már ma is egy tömörebb bináris kódolást használ a keretrendszer belsejében — ezt implementáció közben érdemes megerősíteni, de a JSON-nak itt eleve csak a mi kódunkban, a payload ÖSSZEÁLLÍTÁSÁIG van szerepe).
- A várható nyereség (néhány tucat bájt/üzenet, ritka, kis forgalmú, családi/alkalmi játék, nem verseny-szintű késleltetés-érzékenység) nem áll arányban a fenntartási költséggel (egyedi kódek/dekódek karbantartása, a hibakeresés nehezebb egy bájt-szintű formátumnál, mint JSON-nál).
- Ez klasszikus korai optimalizáció — a projekt saját elve is ("ne tervezzünk feltételezett jövőbeli igényekre") ez ellen szól, amíg nincs mért, valós szűk keresztmetszet.

**Ha ennek ellenére szeretnéd megcsinálni tanulási/érdekességi célból, támogatom** — de javaslom külön, Hotel-0b-től független feladatként kezelni (nem blokkolja/nem függ tőle semmi), hogy a multiplayer-réteg tervezett ütemezése ne csússzon emiatt.

**4. `GameRoom` action-tudatos ellenőrzés — véglegesített, játék-független sablon.** A pontos tervet lásd 6.4 szakasz — a lényeg: EGYETLEN abstract metódus (`isActionAllowed`) váltja fel a jelenlegi `isPlayersTurn`-t, a `GameRoom` semmit nem tud arról, HOGY vagy MIÉRT néz bele egy játék az action-be, csak a szerződést adja (state + slot + action → engedélyezett-e). Dáma ezt a paramétert egyszerűen figyelmen kívül hagyja (nem kell neki), Hotel kihasználja. Ez a "generalizáljunk, ahol csak lehet" elv konkrét alkalmazása — a bázisosztály nem Hotel egyedi igényére lett bővítve, hanem egy általánosan hasznosabb, szélesebb szerződésre, aminek Dáma jelenlegi esete csak egy speciális (triviális) esete.

## 6. A teljes mezőnkénti `@colyseus/schema`-refaktor — technikai vázlat

Ez a legnagyobb, még ki nem dolgozott rész — az alábbi egy **javaslat**, nem lezárt terv, mert több benne rejlő technikai kérdés implementáció közben is módosulhat.

### 6.1 `GameRoom` negyedik generikus paramétere

A `dama-0b-multiplayer-specifikacio.md` §6.1 már 2026-07-22-től jelezte: a `GameRoom<TState, TAction, TPlayerSlot>` a Colyseus `Room`-ot `Room<OpaqueGameStateSchema, RoomMetadata, unknown, AuthPayload>`-ként hardcode-olja — egy leszármazott ma NEM tud másik Colyseus state-típust adni. Hotel-0b ezt most ténylegesen megoldja: `GameRoom<TState, TAction, TPlayerSlot, TColyseusState extends Schema = OpaqueGameStateSchema>`, ahol `DamaRoom` a default (`OpaqueGameStateSchema`) marad, `HotelRoom` pedig egy új, mezőnkénti `HotelStateSchema`-t ad. A `syncState()` metódus (jelenleg `this.state.stateJson = JSON.stringify(this.gameState)`) game-specifikussá válik — `DamaRoom` marad a jelenlegi JSON-szerializálásnál, `HotelRoom` a `TState → TColyseusState` mezőnkénti átmásolást végzi.

### 6.2 `HotelStateSchema` — mezőnkénti leképezés

| `HotelState` mező | Javasolt Schema-reprezentáció |
|---|---|
| `board`, `lots`, `players` | `ArraySchema<BoardSpaceSchema/HotelLotSchema/PlayerSchema>` — rögzített hosszúságú (31/8/N), csak a mezőik változnak kör közben, így ezek diffelése a fő nyereség (jelenleg egyetlen `cash`-változás is az egész state-et újraküldi). |
| `currentPlayerIndex`, `turnPhase`, `lastMoveRoll`, `lastNightsRoll`, `lastBuildingPermitRoll`, `constructionLockedThisTurn`, `staircasePurchaseRightActive`, `status`, `winnerId` | Egyszerű primitív mezők (`number`/`string`/`boolean`), közvetlenül. |
| `pendingConstructionPlan`, `pendingAuction`, `pendingDebt`, `pendingNightsRollLotId` | Nullable beágyazott mezők — a `@colyseus/schema` nullable child-Schema-referenciákat támogat (`undefined` = nincs jelen), ez implementáció közben ellenőrizendő a jelenleg használt `@colyseus/schema` verzióval (a projekt korábban már talált egy `ArraySchema`-verziós meglepetést, lásd a memória "mindig a ténylegesen resolvált .d.ts-t ellenőrizd" tanulságát — ugyanez itt is érvényes). |
| `lotsWithStaircasePurchasedThisTurn` | `ArraySchema<string>`. |
| **`log: LogEntry[]`** | **`ArraySchema<string>`, minden elem `JSON.stringify(entry)`** — nem egy 15-variánsú `LogEntrySchema` osztály. Ez a javaslat lényege: a `LogEntry` TS-unió továbbra is EGYETLEN helyen (`state.ts`) van leírva, nincs párhuzamos Schema-osztály minden variánshoz (ami a `@colyseus/schema` diszkriminált-unió-támogatás hiánya miatt amúgy is nehézkes lenne). Az `ArraySchema` push-alapú diffelése emiatt is működik — csak az ÚJONNAN hozzáadott bejegyzések mennek át a hálózaton, a régiek nem, ami pont a napló-probléma valódi megoldása, anélkül hogy a `LogEntry` típust duplikálni kéne. A kliens `JSON.parse`-olja vissza soronként. |

### 6.3 `ColyseusGameTransport` átalakítása

A jelenlegi `JSON.parse(networkState.stateJson)` egyetlen-mezős dekódolás helyett a Hotel-verzió a `TColyseusState` Schema-példányból építi fel a plain `TState` objektumot (`.toJSON()`-hoz hasonló, de kézzel írt leképezés, mert a `log` mezőt vissza kell alakítani `LogEntry[]`-vé az `ArraySchema<string>`-ből). Ez azt jelenti, hogy **`ColyseusGameTransport` játékonként specializálódik** (vagy egy game-specifikus `decode(colyseusState): TState` függvényt kap paraméterként) — eddig teljesen game-agnosztikus volt, ez az egyetlen pont, ahol ez a döntés ezt megtöri. Ez tudatos, dokumentált kompromisszum, nem mellékhatás. Az 5.1/2. pontbeli időszakos teljes-szinkron (`fullSync`) ugyanezen a `decode`-on nem megy át — az egyenesen `JSON.parse`-ot használ, mivel nyers `TState`-et küld, nem `TColyseusState`-et.

### 6.4 `GameRoom` action-tudatos ellenőrzés — végleges tervezet

Az 5.1/4. döntés konkrét formája. **A jelenlegi `isPlayersTurn(state, slot): boolean` teljesen lecserélődik** (nem kiegészül, nem marad meg párhuzamosan — egyetlen felelősség, egyetlen metódus):

```typescript
// src/server/core/GameRoom.ts
protected abstract isActionAllowed(state: TState, playerSlot: TPlayerSlot, action: TAction): boolean;
```

Az `onMessage('action', ...)` handler `isPlayersTurn(this.gameState, slot)` hívása `isActionAllowed(this.gameState, slot, action)`-ra cserélődik — ezen kívül semmi más nem változik a `GameRoom`-ban.

**Miért marad külön az `isValidAction`-től** (nem vonjuk össze egy metódusba): a kettő ortogonális felelősség — `isValidAction(action): action is TAction` egy tiszta alak-/típus-ellenőrzés, state és slot nélkül; `isActionAllowed(state, slot, action)` egy jogosultság-ellenőrzés, ami a game state-et és a küldő azonosságát is figyelembe veszi. Az egybevonás egy metódusba két, egymástól független ok miatt bukhatna el (rossz alak VS nem jogosult), ami elmosná a hibaüzenet/naplózás pontosságát későbbi hibakereséskor — külön tartva mindkettő Single-Responsibility marad.

**`DamaRoom`** (viselkedés nem változik, csak a metódusnév és -szignatúra):

```typescript
protected isActionAllowed(state: DamaState, playerSlot: Player): boolean {
  return state.currentPlayer === playerSlot; // az action paramétert nem használja — Dámánál nincs kivétel "csak a soron lévő léphet" alól
}
```

**`HotelRoom`** (itt validja magát az egyetlen ismert kivételt):

```typescript
protected isActionAllowed(state: HotelState, playerSlot: PlayerId, action: HotelAction): boolean {
  if (action.type === 'PLACE_BID' || action.type === 'PASS_BID') {
    return action.bidderId === playerSlot; // az egyetlen dokumentált kivétel — docs/hotel-0a-specifikacio.md §9.1
  }
  return getCurrentPlayer(state).id === playerSlot;
}
```

**Szép mellékhatás:** mivel a Hotel motor már ma is `PlayerId` (`'player-1'`, `'player-2'`, ...) stringeket használ játékos-azonosítóként (`state.ts`), a `HotelRoom.assignPlayerSlot(joinIndex)` egyszerűen ``player-${joinIndex + 1}``-et adhat vissza — a `TPlayerSlot` és a motor saját `PlayerId`-ja pontosan ugyanaz a séma, nincs szükség egy külön, párhuzamos slot-elnevezési rendszerre (szemben Dámával, ahol `Player = 'LIGHT'|'DARK'` egy a motorétól független, Colyseus-réteg-specifikus elnevezés).

Ez az elv ("a bázisosztály a lehető legáltalánosabb szerződést adja, a konkrét játék dönti el, mennyit használ belőle") a tervben másutt is követve van: a 6.3-beli `decode` paraméterezés, és az 5. döntésben elfogadott közös online-room komponens is ugyanezt a mintát követi.

## 7. Egyedi bájt-szintű szerializáló — véglegesen elvetve (2026-07-24)

Az 5.1/3. pontbeli ajánlás megerősítve — nem lett Hotel-0b feladat, a JSON marad a log-bejegyzéseknél és az időszakos teljes-szinkronnál.

## 8. Smoke teszt a nullable child-Schema mezőkre (implementáció előtt)

Mielőtt a `HotelStateSchema` ténylegesen megíródott, egy gyors, önálló (szerver/adatbázis nélküli) smoke teszt ellenőrizte a `pendingConstructionPlan`/`pendingAuction`/`pendingDebt`/`pendingNightsRollLotId` nullable beágyazott mezők, illetve a `log: ArraySchema<string>` push-alapú diffelésének tényleges viselkedését a projektben ténylegesen telepített `@colyseus/schema@3.0.76`-ban — ugyanaz az elővigyázatosság, mint a korábbi `ArraySchema.deleteAt` meglepetésnél (mindig a ténylegesen resolvált API-t ellenőrizzük, nem a feltételezettet). Az `Encoder`/`Decoder` osztályokat közvetlenül használja (`@colyseus/schema` publikus API-ja), Colyseus szerver/kliens/adatbázis nélkül — lásd `temp/hotel-schema-nullable-field-smoke-test.ts`.

**Eredmény: mind a 11 ellenőrzés zöld** — a 6.2 szakaszbeli tervezett Schema-reprezentáció működik: nullable gyerek-Schema mező alapból `undefined`, helyesen beállítható/mutálható/törölhető, `ArraySchema<string>` push-jai helyesen halmozódnak, JSON oda-vissza út veszteségmentes.

Osztálydiagram: [`docs/diagrams/hotel-0b-gameroom-class-diagram.puml`](./diagrams/hotel-0b-gameroom-class-diagram.puml) (`GameRoom`/`DamaRoom`/`HotelRoom`/`HotelStateSchema`/`ColyseusGameTransport` viszonya, az `isActionAllowed`/`requestFullSync` bővítésekkel).

## 9. Implementáció (2026-07-24)

Minden az 5-6. szakaszban leírt döntés megvalósult:

- **`GameRoom` (`src/server/core/GameRoom.ts`):** negyedik generikus paraméter (`TColyseusState extends Schema & GameRoomState`, alapértelmezetten `OpaqueGameStateSchema`); `isPlayersTurn` → `isActionAllowed(state, slot, action)`; `syncState`/`createColyseusState` abstract metódusok (a korábbi, hardcode-olt `new OpaqueGameStateSchema()`/JSON-szerializálás helyett); `RECONNECTION_WINDOW_SECONDS` 120→300; game-agnosztikus `requestFullSync`/`fullSync` üzenetpár; új `onPlayerAdmitted(slot, auth)` opcionális hook (alapból no-op) — ezt menet közben kellett hozzáadni, mert Hotel `Player.name`-je csak csatlakozáskor derül ki, a `createInitialState()` viszont még senki csatlakozása előtt lefut (lásd lent, "élő teszttel talált hiba").
- **`GameRoomState`** (`src/shared/core/GameRoomState.ts`, új fájl): a `ready`/`pendingRequests` közös szerződés kiemelve, hogy a szerver (`GameRoom`) ÉS a kliens (`useOnlineGameRoom`) is ugyanazt importálja.
- **`src/shared/games/hotel/colyseus/HotelStateSchema.ts`** (új): mezőnkénti Schema — `board`/`lots`/`players` csak a MUTÁLHATÓ mezőket tükrözik (statikus konfig-adat, pl. `nightlyRates`, `buildingPrices`, `adjacentLotIds`, sosem megy a hálózaton, mindkét oldal a meglévő `hotelConfigs.ts`-ből olvassa); `log: ArraySchema<string>` (`JSON.stringify(LogEntry)` elemenként, a tervezett megoldás).
- **`src/shared/games/hotel/colyseus/hotelStateCodec.ts`** (új): `applyHotelStateToSchema` (szerver, helyben mutál — csak új elemeket hoz létre első híváskor, utána mindig a meglévő Schema-példányok mezőit írja át, ez adja a hatékony diffelést) és `decodeHotelStateSchema` (kliens, visszaépíti a plain `HotelState`-et a szinkronizált mezőkből + a statikus konfigból).
- **`src/server/games/hotel/HotelRoom.ts`** (új): `maxClients` dinamikus (`onCreate`-ben, `options.playerCount`-ból, 2-4 közé szorítva); `assignPlayerSlot` a motor saját `PlayerId`-sémáját adja vissza (`player-N`); `isActionAllowed` a `PLACE_BID`/`PASS_BID` kivétellel (`action.bidderId === playerSlot`); `isValidAction` (alak-ellenőrzés, két segédfüggvényre bontva a komplexitás-limit miatt, ugyanaz a minta, mint `reducer.ts` `dispatchMovementAndProperty`/`dispatchStaircaseAuctionAndTurn`-je); `computeAiMove` egyelőre mindig `null` (Hotel-0d feladata); `onPlayerAdmitted` állítja be a valós `auth.displayName`-et a csatlakozó helyére (a `createInitialState` induláskor még csak "1. játékos"/"2. játékos" placeholdereket kap, mert a nevek csatlakozáskor derülnek ki).
- **`src/server/index.ts`:** `gameServer.define('hotel', HotelRoom).enableRealtimeListing()`.
- **`ColyseusGameTransport`** (`src/client/core/transport/`): `decode` paraméter kötelezővé vált (a korábbi, csak opaque-JSON-t feltételező viselkedés helyett minden hívó explicit adja meg), `TColyseusState` harmadik generikus paraméter, `requestFullSync`/`fullSync` időzített (60 mp) körbejárás, `dispose()` a leiratkozáshoz.
- **`useOnlineGameRoom`** (`src/client/core/transport/useOnlineGameRoom.ts`, új, game-agnosztikus hook): a `DamaOnlineGamePage` ~250 sorából kiemelve — csatlakozás (create/join, újracsatlakozási token), jelszó/kérelem UI állapot, **soronkénti** (nem egyetlen "opponentStatus") kapcsolat-státusz N szereplőre. `DamaOnlineGamePage` átállt rá (kb. 160 sorra egyszerűsödve), `HotelOnlineGamePage` (új) ugyanezt használja.
- **`NEW_ROOM_PARAM`** áthelyezve `src/client/games/dama/` alól `src/client/core/transport/onlineRoomConstants.ts`-be — game-agnosztikus, mindkét `*OnlineGamePage` és a `LobbyPage` innen importálja.
- **`HotelGamePage`:** opcionális `transport`/`myPlayer` prop (a `DamaGamePage` mintája). `PlayerActionWheel` új `interactive` prop — nem a saját köröd esetén minden körcikk `disabled`, de a tárcsa látható marad (nyílt infó).
- **`gamesRegistry.ts`:** `GameDescriptor.online?: {supportsAiOpponent?, playerCountRange?}` — Dáma `{supportsAiOpponent: true}`, Hotel `{playerCountRange: [2,4]}`. `LobbyPage` "Új szoba" modalja ebből dönti el, Ember/AI választót vagy játékosszám-választót mutasson-e (nem `gameId === 'hotel'` hardcode).
- **`routes.tsx`:** `/games/hotel/online/:roomId`, `lazy()`-vel (code-splitting megtartva).

### 9.1 Élő teszttel talált és javított hiba

A **standalone** codec-smoke-teszt (10 lépés, valódi reducer-hajtotta state-tel) mind zöld volt, de csak a 3-kliens **élő** teszt (`temp/hotel-multiplayer-smoke-test.ts`, valódi szerver + Postgres + 3 valódi Colyseus-kliens) buktatta le: a csatlakozó játékosok valós neve **sosem jutott el a klienshez** — mindenki "1. játékos"/"2. játékos" maradt. Ok: `syncPlayerFields` (a `HotelPlayerSchema` mezőnkénti frissítője) csak `cash`/`position`/`bankrupt`-ot írta át minden szinkronnál — a `name` csak a Schema-példány LÉTREHOZÁSAKOR (a szoba indulásakor, még placeholder névvel) lett beállítva, `onPlayerAdmitted`-tól a valós névre módosuló `gameState`-et a következő `syncState()` már nem vezette át a `name` mezőre. Javítva: `syncPlayerFields` mostantól a `name`-et is minden szinkronnál újraírja. **Ez pontosan az a fajta hiba, amit a standalone teszt szerkezetileg nem tudott volna elkapni** (sosem tesztelt egy már létrehozott Schema-példányon egy utólagos névváltoztatást) — ezért volt fontos a valódi, élő multiplayer smoke teszt is, nem csak az izolált kódolás/dekódolás ellenőrzés.

### 9.2 Ellenőrzés

- `tsc --noEmit` (kliens), `typecheck:server`, `eslint .` (teljes projekt) — mind zöld.
- `vitest run` — 111/111 (a motor-tesztek változatlanok, a multiplayer-réteg nem érinti a reducert).
- `vite build` — a code-splitting megtartva: `HotelOnlineGamePage`/`DamaOnlineGamePage`/`useOnlineGameRoom` külön, kis chunk-ok; a nagy `HotelGamePage` chunk (Three.js-szel, ~950KB) továbbra is csak akkor töltődik le, ha valaki ténylegesen megnyitja a Hotelt.
- **Regresszió (Dáma) — mind a négy meglévő élő smoke teszt újrafuttatva egy valódi szerver ellen, mind zöld:** `two-client-smoke-test.mjs`, `ai-password-request-smoke-test.ts`, `reconnection-smoke-test.ts`, `lobby-realtime-listing-check.ts`. A `GameRoom`-generalizálás (4. generikus paraméter, `isActionAllowed`, 300 mp-es reconnect-ablak) nem tört el semmit Dámánál.
- **Új, élő 3-kliens Hotel smoke teszt** (`temp/hotel-multiplayer-smoke-test.ts`) — mind zöld: szoba létrehozás `playerCount:3`-mal, `ready` helyesen `false`→`false`→`true` 1/3→2/3→3/3 csatlakozásnál, helyes slot-kiosztás (`player-1/2/3`), valós megjelenített nevek (9.1 hiba javítása után), egy `ROLL_MOVE_DICE` valóban szinkronizálódik mindhárom kliensre a tényleges WebSocket/schema-diff csatornán (nem csak az izolált Encoder/Decoder-teszt), **egy másik játékos által küldött, nem-rá-tartozó action-t a szerver ténylegesen elutasít** (`isActionAllowed` élesben, nem csak egységtesztben), és egy jogos `BUY_LOT` sikerül és szinkronizálódik.
- A tesztekhez használt ideiglenes Postgres-konténer és szerver-folyamat eltávolítva/leállítva a teszt végén; a gépen futó, ehhez a projekthez nem tartozó `dev-postgres` konténer érintetlen maradt.

### 9.3 Amit ez a kör NEM fed le

- **Élő böngészős teszt** — a fentiek mind Node-szkriptes smoke tesztek (mint minden korábbi Fázis 0b/0c kör), nem tényleges böngészőben, több valódi eszközön végigjátszott teljes parti. Ugyanaz a korlát, mint korábban: nincs böngésző-automatizálási eszköz ebben a környezetben.
- **`HotelRoom`-hoz tartozó automatizált (vitest) tesztek** — a meglévő minta szerint (Dáma `DamaRoom`-jának sincs vitest-je, csak élő smoke teszt) ez konzisztens, de érdemes tudni, hogy a `HotelRoom`/`hotelStateCodec` egyetlen automatizált regressziós védelme jelenleg a smoke tesztek (`temp/`), amik NEM futnak le a normál `npm run test`-tel.
- **A `pendingConstructionPlan`/`pendingDebt`/`pendingNightsRollLotId` élő, hálózaton-át tesztelése** — a standalone codec-teszt lefedte ezeket (izoláltan), az élő 3-kliens teszt nem ment el idáig (időigényes lenne mesterségesen adósságba/árverésbe hozni egy klienst csak dobás-értékek megfelelő megválasztásával) — alacsony kockázatúnak ítélve, mivel a standalone teszt pont ugyanazt az `applyHotelStateToSchema`/`decodeHotelStateSchema` kódot futtatja, amit az élő szerver is használ.
