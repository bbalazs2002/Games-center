# Ramses-0b — Specifikáció: multiplayer réteg

Állapot: **IMPLEMENTÁLVA és élesben ellenőrizve (2026-07-27).** Lásd a 6. szakaszt a részletekért.

## 1. Cél és hatókör

A Ramses-0a hot-seat vertikum után a következő lépés — ugyanaz a minta, mint Dámánál (0a→0b) és Hotelnél (0a→0b) — a már meglévő Colyseus-alapú multiplayer infrastruktúra rákötése a Ramses motorra, kódduplikálás nélkül.

**Hatókörben:** valós idejű, több böngészőből játszható Ramses szoba — szoba létrehozás (2-5 fő, jelszó opcionálisan), csatlakozás/csatlakozási kérelem, újracsatlakozás, valós idejű lobby-lista. Ugyanaz a csomag, amit Dáma/Hotel is kapott.

**Nincs hatókörben (mint Ramses-0a-nál is):** AI ellenfél (külön, későbbi fázis lenne, ugyanúgy, ahogy Dáma-0c és Hotel-0d is külön volt), speciális akciókártyák, haladó zseton-verzió, szóló mód.

## 2. Amit a Dáma/Hotel multiplayer-rétege már megold, változtatás nélkül örökölhető

- `GameRoom` (szoba-jelszó, csatlakozási kérelem, újracsatlakozás 300s, valós idejű lobby-lista, `isValidAction`/`isActionAllowed` validáció, `onPlayerAdmitted` hook) — **egyetlen kivétellel, lásd 3.2**.
- `useOnlineGameRoom` kliens-oldali hook (csatlakozás/létrehozás, jelszó/kérelem UI-állapot, per-slot kapcsolat-státusz) — teljesen game-agnosztikus, nulla módosítás kell.
- `ColyseusGameTransport` (a `GameTransport` interfészt implementálja, ugyanúgy, mint `LocalGameTransport` — a `*GamePage` komponens nem tud különbséget tenni hot-seat és online között).
- `LobbyPage` "Új szoba" modal — a `playerCountRange` mező már ma is opcionális, önállóan bekapcsolható fieldset (lásd `CreateRoomModal` `game.online?.playerCountRange` ága), az AI-választó (`supportsAiOpponentCount`) pedig külön, függetlenül kapcsolható — Ramses egyszerűen nem kéri be az AI-fieldsetet, **nulla módosítás kell a `LobbyPage`-ben magában**.
- `routes.tsx`/`server/index.ts` regisztrációs minta (`lazy()` import + `gameServer.define('ramses', RamsesRoom).enableRealtimeListing()`).

## 3. Amit ténylegesen módosítani/bővíteni kell

### 3.1 A rejtett-infó maszkolás — az egyetlen ténylegesen új architekturális elem

Ez a projekt első játéka, ahol a **teljes, valódi state-et NEM szabad 1:1-ben elküldeni a kliensnek** — Dáma és Hotel esetén ez sosem volt kérdés (Hotelnél ez kifejezett, tudatos döntés volt: "nyílt információ, mindenki látja az egész táblát/naplót/minden telket", lásd `hotel-0b-multiplayer-specifikacio.md` 5. szakasz). Ramses ellenben pontosan az E) klaszter ("rejtett információs") teszt-esete, amit a `Projekt-conception.md` már a klaszter-besoroláskor megjósolt.

**A rejtett rész pontosan egy dolog:** egy `RamsesCell.treasureId`, amíg `hasPyramid === true` (a kincs még piramis alatt van). Minden más mező (`activeCard`, `players[].wonCards`, `currentPlayerIndex`, `status`, `winnerIds`) a fizikai játékban is nyíltan látható mindenki számára, nincs maszkolásra szükség.

**Fontos, hogy a `drawPile` (húzópakli) tartalma/sorrendje SOHA nem megy a hálózaton** — ez a fizikai játékban is egy lefordított kupac, aminek a sorrendjét senki nem ismeri előre. Nyitott kérdés (lásd 4. szakasz): mutassuk-e legalább a **darabszámát** ("X lap maradt")?

**Terv:** egy tiszta, motorbeli függvény — `toPublicRamsesState(state: RamsesState): RamsesState` (`shared/games/ramses/engine/rules.ts` vagy egy új `publicView.ts`) — ami egy MÁSOLATOT ad vissza, amiben minden `hasPyramid === true` cella `treasureId`-ja `null`-ra van state-elve, a `drawPile` pedig üres tömb (a tartalma sosem megy a hálózaton — lásd 3.3-nál a `drawPileCount` mezőt, amit a schema-kódoló a maszkolás ELŐTTI valódi `state.drawPile.length`-ből olvas ki, nem a maszkolt másolatból). **Ugyanaz a `RamsesState` típus, nem egy külön "public" típus** — ez szándékos: a kliens strukturálisan sem tudja megkülönböztetni "tényleg üres" és "még nem felfedett kincs" között, ami pontosan a rejtett-infó lényege. A meglévő `selectors.ts` függvények (pl. `getSlidableCellIds`) változtatás nélkül működnek ezen a maszkolt state-en is, mivel egyikük sem néz `treasureId`-t egy még lefedett cellán.

**A szerver oldali `this.gameState` MINDIG a valódi, maszkolatlan state marad** — ezen fut a reducer (a `drawCardForCurrentPlayer`/`applySlidePyramid` logikának a VALÓDI `treasureId`-ra van szüksége a találat eldöntéséhez). A maszkolás kizárólag a drótra kerülő másolatra vonatkozik, két helyen:

1. `RamsesRoom.syncState()` — a schema-szinkronba a maszkolt state kerül.
2. A `requestFullSync`/`fullSync` biztonsági háló — lásd 3.2, mert ez **jelenleg egy valódi rést jelentene**.

### 3.2 `GameRoom` bővítése: `buildFullSyncPayload()` hook — a `requestFullSync` biztonsági rése

**Ez a legfontosabb felfedezés ebben a tervezési körben.** A `GameRoom.onCreate()`-ben már létező, game-agnosztikus biztonsági háló:

```ts
this.onMessage('requestFullSync', (client: Client) => {
  client.send('fullSync', JSON.stringify(this.gameState));
});
```

...a **teljes, nyers `this.gameState`-et** küldi el, megkerülve a `syncState()`-ben végzett bármilyen maszkolást — és a `ColyseusGameTransport` ezt **automatikusan, 60 másodpercenként** meg is hívja (`requestFullSync`), biztonsági hálóként egy hipotetikus elveszett/sérült delta ellen (lásd `hotel-0b-multiplayer-specifikacio.md` 5.1/2). Dáma/Hotel esetén ez ártalmatlan (nincs rejtett infó), de Ramses esetén ez a mechanizmus **egy percenként elküldené a teljes, maszkolatlan kincs-elrendezést minden kliensnek** — ez pontosan az a "csalás hálózati state-vizsgálattal" forgatókönyv, amit a maszkolás egyáltalán meg akar akadályozni.

**Javasolt megoldás:** egy új, felülírható `protected` hook a `GameRoom` alaposztályon, ugyanabban a mintában, mint a már meglévő `resolveServerAction`/`onPlayerAdmitted`:

```ts
/**
 * What to send as the full-state snapshot for requestFullSync/fullSync —
 * default is the raw gameState (Dáma/Hotel have no hidden info, so this is
 * a safe identity). A game with genuinely hidden information MUST override
 * this to return a masked view — otherwise this generic safety-net path
 * would leak the true state straight past syncState()'s own masking.
 */
protected buildFullSyncPayload(): TState {
  return this.gameState;
}
```

...és a `requestFullSync` handler `this.gameState` helyett `this.buildFullSyncPayload()`-t küld. **Alapértelmezett viselkedés változatlan Dáma/Hotel esetén** (identitás-függvény) — ez tisztán additív, nem-veszélyes módosítás a megosztott `GameRoom.ts`-ben. `RamsesRoom` felülírja: `return toPublicRamsesState(this.gameState);` — ugyanaz az egyetlen maszkoló-függvény, mint `syncState()`-ben, nincs duplikált logika.

**Elvetett alternatíva:** a `requestFullSync` `onMessage` handler újra-regisztrálása `RamsesRoom.onCreate()`-ben (a `super.onCreate()` hívás UTÁN), kihasználva, hogy Colyseus `onMessage()`-e feltehetően felülírja az azonos típusú korábbi handlert. Ez elkerülné a megosztott `GameRoom.ts` módosítását, de egy nem-dokumentált, nem-verifikált Colyseus-implementációs részletre támaszkodna (a projekt saját, korábbi tanulsága szerint — lásd az `ArraySchema.deleteAt`/`SchemaConstructor` esetek — mindig a ténylegesen telepített csomag viselkedését kell ellenőrizni, nem feltételezni). A explicit hook egyértelműbb, önmagát dokumentáló, és illeszkedik a projekt kimondott, erős preferenciájához: **"generalizálj bátran — megosztott/újrahasználható absztrakciók az egyedi különleges esetek helyett"** (lásd a `isPlayersTurn` → `isActionAllowed` általánosítást Hotel-0b-nél).

### 3.3 `RamsesStateSchema` — mezőnkénti leképezés

Ugyanaz a minta, mint `HotelStateSchema`/`hotelStateCodec.ts` — egy `shared/games/ramses/colyseus/` mappa két fájllal.

```
RamsesCellSchema      { id, row, col, treasureId?, hasPyramid }
SearchCardSchema       { id, treasureId, points }              // aktív cél-kártya ÉS a megnyert lapok is ezt használják
RamsesPlayerSchema     { id, name, wonCards: ArraySchema<SearchCardSchema> }
RamsesStateSchema      {
  board: ArraySchema<RamsesCellSchema>,
  emptyCellId: string,
  activeCard?: SearchCardSchema,
  drawPileCount: number,          // csak a darabszám — lásd lent
  players: ArraySchema<RamsesPlayerSchema>,
  currentPlayerIndex: number,
  status: string,
  winnerIds: ArraySchema<string>,
  // GameRoomState mezők, mint minden más játéknál:
  ready: boolean,
  pendingRequests: ArraySchema<PendingJoinRequest>,
}
```

**Nincs `drawPile` (a lapok tartalma/sorrendje) mező** — szándékosan (lásd 3.1), ez soha nem megy a hálózaton. **A darabszáma viszont igen** (`drawPileCount: number`, **eldöntve 2026-07-27**) — ez nem szivárogtat semmilyen tartalmi infót, csak azt, hány lap van hátra ("X lap maradt" a HUD-on), és a hot-seat `RamsesGamePage` HUD-ja is kap egy ilyen kiírást ezzel egy időben (jelenleg egyik módban sem jelenik meg, apró, de hasznos UX-kiegészítés).

`applyRamsesStateToSchema(schema, publicState)` / `decodeRamsesStateSchema(schema): RamsesState` — a Hotel mintáját követve: a tábla cellák (`id`/`row`/`col`) csak egyszer, létrehozáskor kerülnek be a schema-tömbbe (sosem változnak), minden további szinkron csak a `treasureId`/`hasPyramid` mezőket írja át indexenként (ez teszi hatékonnyá a bináris diffelést). `wonCards` push-only szinkronizálás — ugyanaz a minta, mint Hotel `log` mezője (`syncLog`), mivel egy játékos győzelmi kupaca csak nőhet a parti alatt, sosem zsugorodik/rendeződik újra.

**Fontos, hogy `treasureId` a schema-n `treasureId?: string` (opcionális, `undefined`-alapú), nem `string | null`** — ugyanaz a minta, mint Hotel `ownerId?`/`bankBuybackPrice?` mezői, mert a `@colyseus/schema` natívan nem ismeri a `null`-t, csak a "nincs beállítva" (`undefined`) állapotot. A dekódoló függvény `schema.treasureId ?? null`-lá alakítja vissza — ez pontosan egybeesik a maszkolás jelentésével (egy lefedett cella `undefined`-ként érkezik, amit a kliens `null`-ként fog látni, megkülönböztethetetlenül egy valóban üres cellától).

### 3.4 `isActionAllowed` — az eddigi legegyszerűbb eset a projektben

Ramses-nek **egyetlen action-típusa van** (`SLIDE_PYRAMID`), és a házi szabály szerint mindig a soron lévő játékos húzza (nincs Hotel-szerű kivétel, mint az árverési licit bárkitől). Ez pontosan Dáma `isActionAllowed` mintáját követi, az `action` paraméter figyelmen kívül hagyásával:

```ts
protected isActionAllowed(state: RamsesState, playerSlot: PlayerId): boolean {
  return getCurrentPlayer(state).id === playerSlot;
}
```

`resolveServerAction` — nincs felülírásra szükség (a `SLIDE_PYRAMID` action nem hordoz kliens-generált véletlenszám-értéket, mint Hotel dobásai, tehát nincs mit szerver-oldalon újragenerálni).

`computeAiMove` — mivel Ramses-0b-nek nincs AI-hatóköre, ez egy triviális `return null;` stub (az absztrakt szerződés megköveteli az implementációt, de az `aiOpponentCount` a Ramses "Új szoba" modaljában sosem kerül beküldésre, tehát ez a kód ténylegesen sosem fut le).

### 3.5 `RamsesRoom` — a többi darab

- `assignPlayerSlot(joinIndex)` → `` `player-${joinIndex + 1}` `` — pontosan megegyezik a motor saját `Player.id` sémájával, ugyanúgy, mint Hotelnél (nincs külön szlot-elnevezési konvenció, mint Dáma LIGHT/DARK-ja).
- `onCreate` — `resolvePlayerCount(options.playerCount)` (2-5 közé szorítva, ugyanaz a minta, mint Hotel 2-4-es szorítása), `this.maxClients` beállítása, `createInitialState` újra-hozzárendelése a tényleges létszámmal.
- `onPlayerAdmitted(slot, auth)` — a placeholder név ("1. játékos" stb.) lecserélése `auth.displayName`-re, ugyanúgy, mint Hotelnél. Ehhez a `rules.ts`-be egy kis `renamePlayer(state, playerId, name): RamsesState` segédfüggvény kell (Hotel `updatePlayer`-jének megfelelője) — jelenleg nincs ilyen, mert a hot-seat módnak sosem kellett egy játékost menet közben átnevezni.
- `syncState()` → `applyRamsesStateToSchema(this.state, toPublicRamsesState(this.gameState))`.

### 3.6 Kliens: `RamsesOnlineGamePage` + `gamesRegistry`/`routes.tsx`

`RamsesOnlineGamePage.tsx` — a `HotelOnlineGamePage`/`DamaOnlineGamePage` mintáját követi 1:1 (`useOnlineGameRoom` + a meglévő `RamsesGamePage`-nek egy `transport`/`myPlayer` prop kellene, amit ma még nem fogad — ugyanaz a hiányzó darab, amit Hotel-0b 3.4-es pontja is talált Hotelnél). `RamsesGamePage` jelenleg mindig `LocalGameTransport`-ot épít saját magának (`useMemo`) — ezt kell kibővíteni egy opcionális, kívülről kapott `transport`/`myPlayer` prop-párral, ugyanúgy, ahogy `HotelGamePage` is megkapta.

**Kör-jelzés online módban — eldöntve 2026-07-27: nincs külön "nem te jössz" üzenet, elég, ha a tábla nem reagál.** `handleCellClick` a meglévő `slidableCellIds` szűrés mellé egy `isMyTurn` (`!myPlayer || myPlayer === currentPlayer.id`) kaput kap — soron kívül a kattintás egyszerűen no-op, nincs semmilyen extra szöveges/vizuális jelzés (sem "várakozás" felirat, sem tábla-elhalványítás). A HUD-on változatlanul látszik, KI van soron (`{currentPlayer.name} köre`), ez elég információ ahhoz, hogy a felhasználó megértse, miért nem történik semmi a kattintására.

`gamesRegistry.ts` — a Ramses bejegyzés kap egy `online: { playerCountRange: [2, 5] }`-öt (AI-mező nélkül, lásd 3.4).

`routes.tsx`/`server/index.ts` — a Dáma/Hotel mintájának pontos megismétlése (`lazy()` import + `.enableRealtimeListing()`).

## 4. Nyitott kérdések a felhasználó felé

- [x] **Mutassuk-e a húzópakli darabszámát** ("X lap maradt")? **Eldöntve 2026-07-27: igen** — `drawPileCount: number` a schema-ban (lásd 3.3), és ezzel egy időben a hot-seat `RamsesGamePage` HUD-ja is megkapja ezt a kiírást (ma egyik mód sem mutatja).
- [x] **A `GameRoom.ts` `buildFullSyncPayload()` hook bevezetése rendben van-e?** **Eldöntve 2026-07-27: igen**, a javasolt irány szerint (lásd 3.2).
- [x] **Kör-jelzés "nem te jössz vagy" UI — eldöntve 2026-07-27: sem szöveges státusz, sem vizuális elhalványítás nem kell**, elég, ha a tábla egyszerűen nem reagál a kattintásra (lásd 3.6).

## 5. Diagram

Lásd [`docs/diagrams/ramses-0b-hidden-info-sync-sequence.puml`](./diagrams/ramses-0b-hidden-info-sync-sequence.puml) — a maszkolási lépés pontos helye a szinkron-folyamatban (mind a `syncState()`, mind a `requestFullSync` útvonalon).

## 6. Terv állapota

Első tervezési kör, 2026-07-27, a 4. szakasz mindhárom nyitott kérdése eldőlt — a kör-jelzés UI apró részletét eredetileg egy "X köre — várakozás…" szöveggel implementáltam, majd a felhasználó kérésére eltávolítva: a tábla egyszerű nem-reagálása (a meglévő `isMyTurn` kliens-oldali kapu) elegendő, semmilyen extra szöveg/vizuális jelzés nem szükséges.

**IMPLEMENTÁLVA, ugyanazon a napon (2026-07-27) — a teljes terv 1:1 megvalósítva, plusz egy kisebb, útközben felfedezett DRY-kiegészítés.** Minden a 3. szakaszban leírt darab elkészült: `GameRoom.ts` `buildFullSyncPayload()` hookja, `toPublicRamsesState`/`renamePlayer` a motorban, `RamsesStateSchema`/`ramsesStateCodec.ts`, `RamsesRoom`, a szerver regisztráció, `RamsesGamePage` `transport`/`myPlayer` prop-jai + `drawPileCount` HUD-kijelzés, `RamsesOnlineGamePage`, `gamesRegistry.ts`/`routes.tsx` bekötés. Útközben egy apró, tervben nem szereplő DRY-refaktor: a `replaceStringArray` helper (eredetileg `hotelStateCodec.ts`-ben lokális) kiemelve `src/shared/core/colyseusSyncHelpers.ts`-be, mivel `ramsesStateCodec.ts`-nek ugyanarra volt szüksége — a "generalizálj, ha egy második fogyasztó ugyanazt igényli" elv szerint.

**Ellenőrzés, több szinten:**
- Egységtesztek: `toPublicRamsesState`/`renamePlayer` (`rules.test.ts`), `getDrawPileCount` (`selectors.test.ts`) — 35/35 Ramses-teszt zöld (166→171 a teljes projektben).
- Önálló (nem-vitest) kódoló/séma smoke teszt, valós `@colyseus/schema` `Encoder`/`Decoder`-rel (`temp/ramses-schema-codec-smoke-test.ts`, ugyanaz a technika, mint `hotel-schema-codec-smoke-test.ts`-nél): explicit ellenőrzi, hogy egy még lefedett, valós kincset rejtő cella a dekódolt (kliens-oldali) állapotban `null`-ként jelenik meg, hogy a `drawPileCount` túléli a kör-utat miközben a tartalom nem, és hogy a `wonCards` push-only szinkron helyesen NÖVEKSZIK (nem újraépül) több egymást követő jutalmazás után.
- **Élő, 2-kliens Colyseus smoke teszt valódi szerver+Postgres ellen** (`temp/ramses-multiplayer-smoke-test.ts`): szoba létrehozás `playerCount`-tal, helyes szlot-kiosztás, valós megjelenítendő nevek `onPlayerAdmitted`-en keresztül, egy `SLIDE_PYRAMID` valós szinkronizálása mindkét kliensre, a kören-kívüli akció elutasítása (`isActionAllowed` a valós WebSocketen keresztül is működik), és **a legkritikusabb ellenőrzés**: a `requestFullSync`/`fullSync` útvonal (amit a `buildFullSyncPayload()` hook javított) a valóban maszkolt állapotot adja vissza, nem a nyers `gameState`-et — ez pontosan az a biztonsági rés, amit ez a tervezési kör felfedezett és javított.
- **Élő böngészős ellenőrzés Playwright-tal, két különálló bejelentkezett kliens (két böngésző-tab, két különböző `Meghívó-kód`-dal redeemelt felhasználó) egy valós szobában**: a lobby "Új szoba" modal helyesen csak a játékosszám-választót mutatja (AI-mező nélkül); a szoba létrehozása/csatlakozás működik; mindkét tab ugyanazt a táblát/HUD-ot látja valós nevekkel; egy csúsztatás az egyik tabból helyesen szinkronizálódik a másikra; a soron-kívüli kliensen a HUD helyesen a soron lévő játékost mutatja (nincs külön "várakozás" felirat, a felhasználó kérésére eltávolítva), és egy ottani kattintás ténylegesen no-op (a kliens-oldali `isMyTurn` kapu is működik, nem csak a szerver-oldali validáció).

`tsc` (kliens+szerver), `eslint`, `vitest` (171/171), `vite build` (a `RamsesOnlineGamePage` saját, kicsi lazy chunkja, code-splitting sértetlen) mind zöldek.
