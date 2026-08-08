# Gazdálkodj okosan-0b — Specifikáció: multiplayer réteg

**Státusz:** IMPLEMENTÁLVA — a teljes terv 1:1 megvalósítva és ellenőrizve (2026-08-08).

## 1. Cél és hatókör

A Gazdálkodj okosan-0a (motor + egyszerű hot-seat UI) lezárva, 44 zöld teszttel, élőben ellenőrizve (`docs/gazdalkodj-okosan-0a-specifikacio.md`). Ez a kör a meglévő, game-agnosztikus Colyseus-infrastruktúrát (`GameRoom`, `useOnlineGameRoom`, `ColyseusGameTransport`) köti rá a motorra — ugyanaz a lépés, mint Dáma-0b/Hotel-0b/Ramses-0b/Gwent-0b, mind a négy már implementálva és élesben ellenőrizve.

**Hatókörben:** valós idejű, több böngészőből játszható szoba — létrehozás (2–6 fő, jelszó opcionálisan), csatlakozás/csatlakozási kérelem, újracsatlakozás, valós idejű lobby-lista. Ugyanaz a csomag, amit a másik négy játék is kapott.

**Nincs hatókörben:** AI ellenfél (0d, mint minden korábbi játéknál), végleges vizuál/3D tábla (0c, korábban elhalasztva), `ENABLED_GAMES`/deploy (a játék marad csak lokálisan elérhető).

## 2. Amit a meglévő multiplayer-réteg már megold, változtatás nélkül örökölhető

A `GameRoom<TState, TAction, TPlayerSlot, TColyseusState>` (`src/server/core/GameRoom.ts`) minden alábbi eleme game-agnosztikus:

- Auth (JWT), szoba-jelszó, láthatóság, csatlakozási kérelem (`pendingRequests`/`respondToJoinRequest`).
- Újracsatlakozás (`allowReconnection`, `RECONNECTION_WINDOW_SECONDS = 300`, `yourSlot` újraküldése).
- Lobby (`LobbyPage`, Colyseus beépített `LobbyRoom` + `.enableRealtimeListing()`) — a `playerCountRange` mező már ma is generikusan kezelt (Ramses-0b óta), **nulla módosítás kell a `LobbyPage.tsx`-ben**.
- `LocalGameTransport`/`GameTransport` interfész, `ColyseusGameTransport` (generikus, `TColyseusState`-től függetlenül), `useOnlineGameRoom` hook.
- A négy opcionális hook (`onPlayerAdmitted`, `isActionAllowed`, `resolveServerAction`, `buildFullSyncPayload`, `afterSync`) mind létezik már — ez a kör csak a legegyszerűbb módon él velük, **nem igényel semmilyen módosítást a megosztott `GameRoom.ts`-ben**.

**Miért különösen egyszerű ez a kör a másik négyhez képest:**
- **Nincs rejtett infó** (már eldöntve, 0a §3.1: "teljesen nyílt game state") — nincs szükség `toPublicXState`-féle maszkolásra, sem a Gwent-féle `afterSync`/privát-csatorna mechanizmusra.
- **Nincs Hotel-szerű kivétel** afelől, hogy csak a soron lévő játékos cselekedhet — minden action implicit a `currentPlayerIndex`-re vonatkozik, nincs egyetlen action-ben sem Hotel `bidderId`-jéhez hasonló explicit céljátékos-mező. Az `isActionAllowed` a legegyszerűbb, Dáma/Ramses-szintű eset.

## 3. Séma-tervezési döntések

### 3.1 Mezőnkénti `@colyseus/schema`, nem opaque-JSON

A `log: LogEntry[]` már a 0a-ban is a Hotel-0b tanulsága alapján lett megtervezve (JSON-szerializálható, `Record`/rögzített hosszúságú tömbök, semmi `Set`/`Map`) — pontosan azért, hogy ez a kör ne igényeljen retrofit-et. Gazdálkodj okosan egy hosszú, sok-körös, sok kis pénzmozgásos parti, mint Hotel — ugyanaz az indoklás érvényes (Gwent ezzel szemben tudatosan opaque-JSON-t választott, mert egy meccs rövid/véges).

### 3.2 Nincs `board` mező a hálózaton

A `BoardSpace` (`index/type/label/amount/furnitureItems/requiresBkvPass`) **egyáltalán nincs mutálva a reducerben** — a vásárlás/tulajdonlás mind a `Player`-en él, nem a mezőn (ellentétben Hotel `HotelLot.ownerId`-jével). A `board` mezőt tehát nem kell szinkronizálni — mindkét oldal a megosztott `boardConfig.ts` `BOARD_SPACES`-ét olvassa közvetlenül. Ugyanígy a `chanceDeck` egyes kártyáinak `text`/`effect` mezői statikusak (`chanceCards.ts`) — csak a **sorrendjük** (a húzás miatti körbeforgás) megy át a hálózaton, kártya-ID-k tömbjeként (`chanceDeckOrder`).

### 3.3 `OwnershipStatus`/`furniture`/`insurance` lapítása

A `@colyseus/schema` natívan nem támogat diszkriminált uniót. Az `OwnershipStatus` (`NONE`/`OWNED_CASH{pricePaid}`/`FINANCED{plan:{...}}`) egy lapos `xStatus: string` + opcionális (`undefined`-alapú) számmezőkre bomlik; a 6 elemű `furniture` és 3 elemű `insurance` Record egyenként lapos boolean mezőkre. A `bankAccount: {balance:number}|null` egyetlen `bankAccountBalance?: number` mezőre lapul (undefined = nincs számla) — a Ramses `treasureId?` mintája.

### 3.4 A `pendingMandatoryInstallments`/`chanceDeckOrder` szinkronja — kritikus, már egyszer élesben elkapott hiba

A `@colyseus/schema` `ArraySchema#splice` NEM enged üres tömbből nem-üresbe váltó splice-t (`insertCount > deleteCount` hiba) — ez törte el élesben a Ramses `winnerIds` szinkronját (2026-07-30, lásd `ramses-0a-specifikacio.md` §9.4). A `pendingMandatoryInstallments` PONTOSAN ez a mintázat (üresen indul, időnként megtelik, majd újra kiürül) — a már létező, javított `src/shared/core/colyseusSyncHelpers.ts` `replaceStringArray` helperrel szinkronizálva, sosem direkt `splice`-sal. Ugyanez a helper a `chanceDeckOrder`-hez is (max 35 rövid string, teljes csere minden húzásnál — elhanyagolható az unbounded-log-gondhoz képest).

## 4. Tervezett fájlok

**Szerver:**
- `src/server/games/gazdalkodjOkosan/GazdalkodjOkosanRoom.ts` (új) — `HotelRoom.ts`/`RamsesRoom.ts` 1:1 mintája:
  - `maxClients` dinamikus (`onCreate`, `options.playerCount`, 2–6 közé szorítva)
  - `assignPlayerSlot(joinIndex)` → `` `player-${joinIndex+1}` ``
  - `onPlayerAdmitted(slot, auth)` → `renamePlayer(state, slot, auth.displayName)`
  - `isActionAllowed(state, slot)` → `getCurrentPlayer(state).id === slot`
  - `isValidAction` — alak-ellenőrzés, 2 segédfüggvényre bontva (komplexitás-limit)
  - `resolveServerAction` — KIZÁRÓLAG `ROLL_MOVE_DICE`-nál regenerálja a `value`-t szerver-oldali `rollD6()`-kal
  - `computeAiMove` → mindig `null`
  - `syncState()` → `applyGazdalkodjOkosanStateToSchema(this.state, this.gameState)`
- `src/shared/games/gazdalkodjOkosan/dice.ts` (új) — `rollD6()`, a Hotel `dice.ts` mintája
- `src/server/index.ts` — `gameServer.define('gazdalkodj-okosan', GazdalkodjOkosanRoom).enableRealtimeListing()`, `isGameEnabled` mögé kapuzva

**Megosztott:**
- `src/shared/games/gazdalkodjOkosan/colyseus/GazdalkodjOkosanStateSchema.ts` (új) — `GazdalkodjOkosanPlayerSchema` (lapos mezők, lásd 3.3) + root séma (`players`, `currentPlayerIndex`, `turnPhase`, `pendingMandatoryInstallments`, `lastDiceRoll?`, `status`, `winnerId?`, `log`, `chanceDeckOrder` + `GameRoomState` mezők)
- `src/shared/games/gazdalkodjOkosan/colyseus/gazdalkodjOkosanStateCodec.ts` (új) — `applyGazdalkodjOkosanStateToSchema`/`decodeGazdalkodjOkosanStateSchema`
- `src/shared/games/gazdalkodjOkosan/engine/rules.ts` — új `renamePlayer(state, playerId, name)` export

**Kliens:**
- `src/client/games/gazdalkodjOkosan/ui/GazdalkodjOkosanOnlineGamePage.tsx` (új) — `HotelOnlineGamePage.tsx`/`RamsesOnlineGamePage.tsx` mintája
- `src/client/games/gazdalkodjOkosan/ui/GazdalkodjOkosanGamePage.tsx` — új opcionális `myPlayer?: PlayerId` prop; az `ActionPanel` csak akkor jelenik meg, ha `!myPlayer || myPlayer === currentPlayer.id` (Ramses "nincs külön 'várj' szöveg" döntése)
- `src/client/shell/gamesRegistry.ts` — `online: { playerCountRange: [2, 6] }`
- `src/client/shell/routes.tsx` — `/games/gazdalkodj-okosan/online/:roomId`, `lazy()`-vel

## 5. Verifikáció

1. `renamePlayer` egységteszt.
2. Önálló (nem-vitest) séma-kódoló smoke teszt valós `@colyseus/schema` `Encoder`/`Decoder`-rel — `OwnershipStatus` mindhárom variánsa, `bankAccountBalance` undefined↔null, **`pendingMandatoryInstallments` üres→feltöltött→üres** (a kritikus eset), `log` push-only, `chanceDeckOrder` átrendeződés.
3. Élő, 2+ kliens Colyseus smoke teszt valós szerver+Postgres ellen — szoba létrehozás, szlot-kiosztás, valós nevek, `ROLL_MOVE_DICE` szinkron + szerver-oldali dobás-regenerálás igazolása, kören-kívüli action elutasítása, egy vásárlás+törlesztés forgatókönyv, `requestFullSync`/`fullSync`.
4. `tsc`, `eslint .`, `vitest run`, `vite build`.
5. **Amit ez a kör NEM fed le:** valódi böngészős (Playwright) többklienses UI-teszt — a smoke tesztek a Colyseus-protokoll szintjén ellenőriznek.

## 6. Ellenőrzés eredménye (2026-08-08)

A teljes tervezett fájllista 1:1 elkészült, módosítás nélkül a megosztott `GameRoom.ts`-ben — ez lett a négy meglévő 0b kör közül a legkisebb delta, pontosan a tervben leírt indok szerint (nincs rejtett infó, nincs Hotel-szerű "más játékos is cselekedhet" kivétel).

**Egy valós, addig láthatatlan motor-hiba** került elő a standalone séma-kódoló smoke teszt írása közben (nem a hálózati rétegben, a `reducer.ts`-ben): `applyPayInstallment` az utolsó törlesztő kifizetése után NEM ürítette ki a `pendingMandatoryInstallments` listát — a `resolveLandedSpace` egyik belső `{ ...state, ... }` spread-je sem érinti ezt a mezőt, így a lista a régi (`['car']`/`['apartment']`) értéken ragadt egészen addig, amíg egy másik törlesztés vagy a `finishTurn()` felül nem írta. Ez hot-seat módban is fennállt volna, csak eddig nem volt elég éles ellenőrzés, ami elkapja. Javítva (`resolveLandedSpace({ ...next, pendingMandatoryInstallments: [] }, player.id)`), regressziós vitest-tel megerősítve, a sibling hívási hely (`applyRollMoveDice`-on belül, ami mindig már üres listát örököl a `finishTurn()`-ből) ellenőrizve, hogy nem érintett.

**Tesztek:**
- `renamePlayer` egységteszt (`rules.test.ts`) — zöld.
- Önálló (nem-vitest) séma-kódoló smoke teszt valós `@colyseus/schema` `Encoder`/`Decoder`-rel (`temp/gazdalkodj-okosan-schema-codec-smoke-test.ts`), 14 lépés, mind zöld: kezdőállapot, `OwnershipStatus` mindhárom variánsa (NONE/OWNED_CASH/FINANCED), a kritikus `pendingMandatoryInstallments` üres→feltöltött→üres átmenet (pontosan a Ramses `winnerIds`-hibájának mintázata, `replaceStringArray`-jel javítva/elkerülve), bankszámla nyitás+befizetés, bérlet FINANCED vásárlás, bútor vásárlás, autó OWNED_CASH közvetlen beállítás, szerencsekártya-húzás (pakli-átrendeződés + log-növekedés). Záró ellenőrzés: `serverSchema.log.length === state.log.length`.
- **Élő, 2-kliens Colyseus smoke teszt valós szerver+Postgres ellen** (`temp/gazdalkodj-okosan-multiplayer-smoke-test.ts`): szoba létrehozás `playerCount: 2`-vel, `ready=false`→`true` átmenet a második csatlakozáskor, helyes szlot-kiosztás (`player-1`/`player-2`), valós megjelenítendő nevek `onPlayerAdmitted`-en keresztül (nem placeholder "1. játékos"), egy `ROLL_MOVE_DICE` action **szándékosan hamis kliens-oldali értékkel (999)** — igazolva, hogy a szerver `resolveServerAction`-je eldobja ezt és a saját `rollD6()` eredményét (1–6 közötti valós érték) küldi mindkét kliensnek, a pozíció ez alapján mozdul; kören-kívüli akció (a nem-soron-lévő kliens próbál dobni) helyesen, csendben elutasítva (`isActionAllowed`); `requestFullSync`/`fullSync` kör-út a valós, aktuális állapottal. Mind a hat ellenőrzés elsőre zöld volt.
- `tsc` (kliens+szerver), `eslint .`, `vitest run` (**518/518**, a `renamePlayer` teszttel 517→518), `vite build` (a `GazdalkodjOkosanOnlineGamePage` saját, kicsi lazy chunkja) — mind zöldek.

**Amit ez a kör NEM fedett le** (a tervben jelzettek szerint, konzisztensen a korábbi 0b körökkel): valódi böngészős (Playwright) többklienses UI-teszt — a smoke tesztek a Colyseus-protokoll szintjén ellenőriznek, nem a renderelt felületen. AI ellenfél és a 3D/vizuál tábla is explicit kívül maradt ezen a körön (0d, illetve 0c feladata, mint minden korábbi játéknál).

A tesztekhez használt ideiglenes Postgres-konténer és szerver-folyamat leállítva a teszt végén.
