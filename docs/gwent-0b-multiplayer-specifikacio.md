# Gwent-0b — Specifikáció: multiplayer réteg (online + játékos-specifikus rejtett infó)

**Státusz: IMPLEMENTÁLVA (2026-08-03), élő 2-kliens smoke teszttel ellenőrizve.** Ez a dokumentum a jóváhagyott terv leirataként indult (kód írása előtt), a 8–9. szakaszok az implementáció közben derült pontosításokkal/eredményekkel bővültek.

## 1. Cél és hatókör

A Gwent-0a.2 (helyi hot-seat parti-motor + 2D board UI) lezárva, 105 zöld teszttel. A `gamesRegistry.ts` és a `gwent-0a-engine-class-diagram.puml` már előre jelezte a hiányzó "Gwent-0b" réteget. Ennek hatóköre:

- Online, ember-ember 2 fős Gwent-partik a platform meglévő Colyseus-infráján (`src/server/core/GameRoom.ts` + `src/client/core/transport/`), a Dáma/Hotel/Ramses mintáját követve.
- **A projekt eddigi legnehezebb multiplayer-problémája: játékos-specifikus rejtett infó.** Mindenki látja a saját kezét, de nem a másikét — ez strukturálisan más, mint Ramses (`toPublicRamsesState`) szimmetrikus maszkolása, ahol mindkét kliens ugyanazt az egy maszkolt nézetet kapja.
- A felhasználó explicit kérésére: **a helyi hot-seat mód is kapjon kézrejtést** ("add tovább a gépet, nézz el" mechanika minden kör előtt) — eddig a hot-seat mód mindkét kéz tartalmát szabadon mutatta, mert egy gépen ülnek a játékosok.
- **AI ellenfél NEM ebbe a fázisba tartozik** (a felhasználó explicit döntése) — tisztán ember-ember online partik, ahogy Hotel-0b/Dáma-0b is AI nélkül indult, az AI egy külön, későbbi Gwent-0c-szerű kör lenne.

## 2. Amit a meglévő multiplayer-réteg már megold, változtatás nélkül örökölhető

A `GameRoom<TState, TAction, TPlayerSlot, TColyseusState>` (`src/server/core/GameRoom.ts`) alaposztály minden alábbi eleme game-agnosztikus, Gwentre nézve módosítás nélkül átvehető:

- Auth (JWT), szoba-jelszó, láthatóság, csatlakozási kérelem (`pendingRequests`/`respondToJoinRequest`).
- Újracsatlakozás (`allowReconnection`, `RECONNECTION_WINDOW_SECONDS = 300`, `yourSlot` újraküldése).
- Lobby (`LobbyPage`, Colyseus beépített `LobbyRoom` + `.enableRealtimeListing()`).
- `LocalGameTransport`/`GameTransport` interfész, `ColyseusGameTransport` (generikus, `TColyseusState`-től függetlenül).
- `GameRoomCreateOptions`/`GameRoomJoinOptions` — a Gwentnek nem kell `aiOpponentCount`/`playerCount`-ot használnia (fix 2 fő, nincs AI ebben a körben).

## 3. Amit ténylegesen meg kell oldani — a rejtett infó problémája

### 3.1 Mi számít titoknak (fizikai szabály alapján)

| Mező | Kinek látható |
|---|---|
| `leaderId`, `leaderAbilityUsed` | **mindenkinek** — a vezér és hogy elhasználta-e már a képességét, mindig nyilvános |
| `player.hand` | csak a tulajdonosnak — mindenki másnak csak a darabszám |
| `player.deck` (húzópakli) | **senkinek, a tulajdonosának sem** — lásd a felhasználó explicit megerősítését lent |
| `player.mulliganSetAside` | csak a tulajdonosnak (ugyanaz az elv, mint a kéznél; MULLIGAN fázison kívül mindig üres) |
| `discard` (eldobott/már kijátszott lapok) | **mindenkinek** — soha nem maszkolt |
| `board`, `lives`, `roundsWon`, `passed`, `mulligansLeft`, `mulliganConfirmed`, `phase`, `currentPlayerIndex`, `activeWeatherRows`, `winnerIds`, `log` | nyilvános, mindenki számára változatlan |

**Véglegesítve a felhasználó explicit megerősítésével (2026-08-03):** *"A leader minden játékosnak látható a leader ability-vel együtt, ahogy az is, hogy már ki lett-e játszva. A hand-et csak az a játékos láthatja akié. A húzó paklit a tulajdonosa sem láthatja, az eldobott (már kijátszott) lapokat viszont minden játékos láthatja nem csak az akié."* Ez véglegesen lezárja egy köztes implementációs kísérlet kérdését: a `LeaderAbilityPanel` (Gwent-0a.2) korábban engedte a saját pakli név szerinti böngészését 2 vezér-képességnél (Eredin Commander of the Red Riders, Bringer of Death) — ez a fenti szabállyal ütközött. A megoldás **nem** a pakli ambiens felfedése lett, hanem egy **eseti, csak-erre-a-pillanatra szóló felfedés** — lásd 4.6.

A `LEADER_REVEALED_OPPONENT_HAND` log-bejegyzés (`revealedDefIds`, Emhyr Emperor of Nilfgaard hatása) NEM igényel külön szűrést: 2 fős játékban a lehetséges nézők köre pontosan a képesség-aktiváló (akinek szól a leselkedés) és a "meglesett" ellenfél (aki úgyis ismeri a saját kezét) — nincs harmadik fél, aki felé ez szivárogna.

### 3.2 `toPublicGwentState(state, viewerId: PlayerId | null): GwentState`

Új export `src/shared/games/gwent/engine/rules.ts`-ben, `toPublicRamsesState` mintájára, de eggyel több paraméterrel (mert a Gwent titka NEM szimmetrikus):

- `player.deck`: MINDIG placeholder `CardInstance[]`-re cserélődik (`defId: HIDDEN_CARD_DEF_ID`, eredeti `instanceId` megtartva, `chosenRow: null`) — **viewer-től függetlenül, a tulajdonosának is**, a fenti szabály szerint.
- `player.hand`/`player.mulliganSetAside`: ha `player.id === viewerId`, valódi; egyébként ugyanaz a placeholder-csere.
- `viewerId === null`: mindkét oldal `hand`/`mulliganSetAside`-ja is maszkolva — ez a **semleges nézet**, amit a szerver a mindenki felé egyformán szinkronizált, megosztott állapotba ír (ld. 4.1).
- `HIDDEN_CARD_DEF_ID`: új sentinel konstans (`specialCardIds.ts`), amit a kliens felismer, és kártyahátat renderel helyette a valódi kártyakép kikeresése helyett.

**Ugyanez az egy függvény szolgálja ki mindkét fogyasztót** — az online szervert (4. szakasz) ÉS a helyi hot-seat "nézz el" mechanikát (6. szakasz) — nincs kód-duplikáció a két mód maszkolási logikája között.

## 4. Szerver-oldali architektúra

### 4.1 Wire-formátum döntés: `OpaqueGameStateSchema`, NEM mezőnkénti Schema

Hotel/Ramses a mezőnkénti `@colyseus/schema`-refaktort kifejezetten a *korlátlanul növekvő log* + nagy, gyakran változó tömbök hatékony bináris diffelése miatt vezette be (több órás, száz+ körös Monopoly-parti). A Gwent-parti rövid és véges (max 3 kör, néhány tucat lapjátszás) — a Dáma-mintájú "egész állapot egy JSON stringben, minden akciónál újraküldve" itt elfogadható költség, és **elkerüli** a Hotel/Ramses-nél ténylegesen előfordult `ArraySchema#splice` "insertCount > deleteCount" hibaosztályt is (a Gwent játék-tartalmában nincs `ArraySchema`, csak a generikus `pendingRequests`-nél).

### 4.2 A két csatorna

1. **Megosztott (nyilvános) állapot** — `OpaqueGameStateSchema.stateJson`-be írva `syncState()`-ben: `JSON.stringify(toPublicGwentState(this.gameState, null))`. A semleges nézet, mindkét kliensnek egyformán szinkronizálva a Colyseus beépített broadcast-jával.
2. **Privát csatorna** (ÚJ minta ebben a projektben) — minden akció után a szerver külön-külön elküldi mindkét kliensnek a SAJÁT kezét/mulligan-halmazát: `client.send('privateHand', { hand, mulliganSetAside })`. A `deck` itt SZÁNDÉKOSAN nincs benne — a pakli a tulajdonosának sem valódi soha ebben a csatornában (ld. 4.6 a kivételes, eseti felfedésért). Ez NEM megy át a Schema-n — ez a lépés zárja ki, hogy az ellenfél kliense valaha megkapja a másik kezét a hálózaton.

### 4.3 `GameRoom.ts` — egyetlen új, opcionális hook

```ts
/** No-op default — hívva syncState() után minden alkalommal (onCreate, admitPlayer, applyAction).
 *  Egy játék, aminek játékos-specifikus privát adatot is szét kell küldenie a nyilvános
 *  Schema-n kívül (Gwent: saját kéz), ide teszi ezt a logikát. */
protected afterSync(): void {}
```

3 hívási pont a meglévő `syncState()` hívások után. A többi játéknál (Dáma/Hotel/Ramses) a default no-op miatt nulla viselkedésváltozás — ez az egyetlen módosítás a megosztott `GameRoom.ts`-ben.

`buildFullSyncPayload()` aláírása **nem változik** — a Gwent override `toPublicGwentState(this.gameState, null)`-t ad vissza (viewer-független, mint a `syncState()`-beli semleges nézet).

### 4.4 `GwentRoom.ts` (Dáma-minta: fix 2 fős, nincs AI)

`maxClients = 2`, `computeAiMove()` mindig `null`. Új, saját üzenet-handlerek `onCreate()`-ben (a `super.onCreate()` UTÁN, nem felülírva a meglévő `requestFullSync`-et): `this.onMessage('submitDeck', ...)` (ld. 4.5) és `this.onMessage('requestPrivateSync', (client) => this.sendPrivateHandTo(client))`.

**Pontosítás: `isActionAllowed` NEM egyszerűsödik `getCurrentPlayer(state).id === slot`-ra**, ahogy a terv eredetileg feltételezte. A mulligan/kezdőjátékos-választás akciók (`MULLIGAN_SWAP`, `CONFIRM_MULLIGAN`, `CHOOSE_STARTING_PLAYER`) NEM a `currentPlayerIndex`-hez kötöttek a motorban — mindkét fél egymástól függetlenül mulligan-ozhat (a fizikai játékkal egyezően, nem felváltva). A tényleges implementáció ezért minden akció saját `playerId`-ját veti össze a küldő kliens tényleges slotjával (`action.playerId === playerSlot`), a `FLIP_STARTING_COIN`/`CONTINUE_AFTER_ROUND` kivétellel (ezeknek nincs egyetlen "tulajdonosuk" — bármelyik fél kiválthatja, a reducer saját fázis-őre az igazi kapu).

### 4.5 Deck-választás online folyamata

**Pontosítás: nem a `GameRoomJoinOptions.deckConfig` mezőn megy át (ahogy a terv eredetileg javasolta), hanem egy külön `'submitDeck'` üzeneten, csatlakozás UTÁN.** Indoklás: a `GameRoomJoinOptions` a jelszó/join-request-védett szobáknál a jóváhagyás-várakozási ágon (`requestOnly`) nem jut el a `admitPlayer`-ig változatlan formában (a bázisosztály nem adja tovább az eredeti join-options-t a késleltetett admit-hez) — egy explicit, csatlakozás UTÁNI üzenet mindkét csatlakozási úton (közvetlen join ÉS elfogadott join-request) egyformán működik, és nem igényel bázisosztály-módosítást. A kliens a `GwentDeckBuilder`-t (már kivonva 0a.2-ben) csatlakozás UTÁN, egy köztes képernyőn futtatja (nem előtte — így a `useOnlineGameRoom` hook feltétel nélkül, minden render-ben ugyanúgy hívható marad, a React Hooks-szabályokkal összhangban), és a kész draftot `room.send('submitDeck', {...})`-ként küldi el. A szerver a `validateDeckDraft`-tal (már létező, `deckRules.ts`) ellenőrzi (nem bízik a kliens saját validációjában), és `'deckRejected'` üzenettel utasítja el érvénytelen esetben. `GwentRoom` a 2. deck megérkezéséig egy placeholder (üres kezű/paklijú) állapotot tart (`createPlaceholderGwentState()`, `initialState.ts`) — csak ekkor hívja a valódi `createInitialState`-et.

### 4.6 A pakli eseti, csak-erre-a-pillanatra szóló felfedése (2 vezér-képességhez)

Eredin Commander of the Red Riders ("instant, választott időjárás-kártya a pakliból") és Eredin Bringer of Death ("választott lap húzása a pakliból") ténylegesen a kártyaszöveg szerint választást igényel — nem véletlent. Mivel a pakli minden más helyzetben senkinek sem valódi (ld. 4.2), ez a 2 képesség egy **külön, eseti üzenetpárt** kapott, ami KIZÁRÓLAG az aktiválás pillanatában, KIZÁRÓLAG a jogosult játékosnak adja ki a valódi pakli-tartalmat:

- Kliens → szerver: `room.send('requestDeckReveal')` (nincs payload — a szerver a saját `this.gameState`-jéből tudja, ki kéri és milyen vezérrel).
- Szerver: `GwentRoom.onMessage('requestDeckReveal', ...)` — csak akkor válaszol, ha a kérő játékos vezére ténylegesen az egyik a 2 közül (`EREDIN_COMMANDER_OF_THE_RED_RIDERS`/`EREDIN_BRINGER_OF_DEATH`) ÉS `canActivateLeaderAbility(state, slot)` igaz (jogosan, épp most aktiválná) — egyébként csendben nem válaszol.
- Szerver → kliens (csak a kérőnek): `client.send('deckRevealed', { deck: player.deck })` — a VALÓDI pakli, egyetlen alkalomra.
- A kliens ezt SOHA nem gyorsítótárazza a state-ben — a `LeaderAbilityPanel` egy külön, ideiglenes `revealedDeck` React state-be teszi, ami a választó-panel bezárásakor (aktiválás vagy "Mégse") törlődik.
- **Helyi hot-seat módban** nincs hálózat, tehát nincs valódi titok a saját magunktól — a `GwentGamePage` alapértelmezett `requestDeckReveal` implementációja egyszerűen szinkron kiolvassa a TELJES, valódi (maszkolatlan) helyi state-ből a kért játékos pakliját. Online módban a `GwentOnlineGamePage` a fenti valódi hálózati körutat implementálja.

Ez a mechanizmus a `LeaderAbilityPanel`/`MatchBoard`/`GwentGamePage` egy közös, `requestDeckReveal: (playerId) => Promise<CardInstance[]>` propon át adódik tovább — ugyanaz a "helyi mód szinkron, online mód hálózati" mintázat, mint a `toPublicGwentState`/`expectedViewerId` páros helyi vs. online felhasználása.

## 5. Kliens-oldali architektúra

- `useOnlineGameRoom.ts` — **nem igényelt módosítást**: a nyers Colyseus `room` már eleve a visszatérési érték része volt (a terv idején ez tévesen új bővítésként lett feltételezve).
- `GwentOnlineTransport.ts` (ÚJ): `MaskedRamsesTransport` fordítottja — nem kivesz, hanem BEfésüli a privát csatornán érkező valódi kéz+mulligan-halmazt a nyilvánosan szinkronizált, maszkolt állapotba, a saját játékos helyén (a `deck` NEM ennek a transportnak a felelőssége — ld. 4.6, külön, eseti csatorna). Azonosság-alapú memoizálással (`useSyncExternalStore`-kompatibilitás, `MaskedRamsesTransport` dokumentált mintája) — saját listener-halmazt tart, hogy egy `'privateHand'` üzenet önmagában is ki tudjon váltani egy React re-rendert (nem csak a hálózati state-változás).
- `GwentOnlineGamePage.tsx` (ÚJ, `HotelOnlineGamePage`/`RamsesOnlineGamePage` mintája): a kapcsolódás MINDIG megtörténik (Hooks-szabály), a `GwentDeckBuilder` egy köztes, csatlakozás UTÁNI képernyőként fut (ld. 4.5) → `submitDeck` → várakozás, amíg mindkét fél elkészül (a kézhossz > 0 heurisztika jelzi, hogy a valódi állapot felváltotta a placeholdert) → `<GwentGamePage transport={GwentOnlineTransport} myPlayer .../>`.
- `routes.tsx`/`gamesRegistry.ts`: `/games/gwent/online/:roomId` (kötelezően `lazy()`), `online: {}` a Gwent bejegyzésen (nincs AI/playerCount-flag, fix 2 fő).
- **Pótlólagos munka, ami a tervben még nem szerepelt**: `MulliganScreen`/`StartingChoiceScreen`/`MatchBoard` mindegyike kapott egy opcionális `myPlayer?: PlayerId` propot — ha be van állítva (online mód) és épp NEM a helyi játékos köre/döntése, egy "várakozás…" üzenet jelenik meg a (maszkolt) ellenfél-kéz interaktívnak-tűnő megjelenítése helyett. E nélkül a maszkolt ellenfél-kéz kártyahátjai klikkelhetőnek tűntek volna (a `canAttemptToPlayCard`-féle ellenőrzések struktúrálisan igazat adnak egy maszkolt kézre is, hisz az `instanceId`-k megmaradnak) — a szerver `isActionAllowed`-je ezt mindenképp elutasítaná, de a UX megtévesztő lett volna. `HandArea`/`CardTile` is kapott egy `HIDDEN_CARD_DEF_ID`-őrt, hogy sose hívjanak `getCardDef`-et egy maszkolt lapra.
- **Pótlólagos munka #2**: `LeaderAbilityPanel` átalakult, hogy a `requestDeckReveal` propon át kérje le a pakli-céljú vezér-képességek (Commander of the Red Riders/Bringer of Death) valódi, eseti pakli-nézetét (ld. 4.6) — a `player.deck`-et közvetlenül olvasó régi kód eltűnt, mert az mostantól mindig maszkolt.

## 6. Helyi hot-seat mód: "add tovább a gépet" mechanika

A felhasználó explicit kérése alapján a helyi mód is kapjon kézrejtést, **ugyanazt** a `toPublicGwentState`-et használva, mint az online mód — csak más honnan kapja a `viewerId`-t (online: fix `myPlayer`; hot-seat: dinamikusan változó, "kinek nézzük épp a képernyőjét").

- `PassDeviceScreen.tsx` (ÚJ): "Add tovább a gépet — most `<name>` következik" interstitial.
- `GwentGamePage.tsx`: új `activeViewerId` React state + `expectedViewerId(state)` helper (MULLIGAN-ban a még nem `mulliganConfirmed` fél; egyébként `getCurrentPlayer(state).id`; `ROUND_RESOLVED`/`FINISHED`-nél nincs gate, mert nincs rejtett infó a kör-összegzésben). Eltérésnél `PassDeviceScreen` jelenik meg a tartalom helyett. A gyerek-komponensek `toPublicGwentState(state, activeViewerId)`-t kapják a nyers `state` helyett — a `dispatch` továbbra is a valódi, teljes állapotot dolgozó reducerre épül, csak a MEGJELENÍTÉS maszkolt.
- Online módban (`myPlayer` prop jelen van) ez a gate teljesen kikapcsolva marad.
- `CardTile.tsx`: `defId === HIDDEN_CARD_DEF_ID` esetén kártyahát-megjelenítés a valódi kép helyett. Nincs még dedikált kártyahát-asset (csak `box.png` + 2 érme-ikon) — átmenetileg egy egyszerű CSS-placeholder szolgál, a "végleges kinézet nem e kör tárgya" elvvel összhangban.

## 7. Nyitott kérdés — eldőlt

`assignPlayerSlot(joinIndex) { return \`player-${joinIndex + 1}\`; }` — a Hotel/Ramses mintája. A motor `createInitialState` mindig pozicionálisan (`playerConfigs[0]` → `'player-1'`, `playerConfigs[1]` → `'player-2'`) építi fel a játékosokat, függetlenül attól, honnan jött a `GwentPlayerConfig` — a csatlakozási sorrend tehát természetesen egybeesik a motor saját `PlayerId`-sémájával, nincs szükség egy Dáma-szerű, motor-független `LIGHT`/`DARK` elnevezésre.

## 8. Implementáció (2026-08-03)

Minden a 3–7. szakaszban leírt (és menet közben pontosított) döntés megvalósult:

- **`src/shared/games/gwent/engine/rules.ts`**: `toPublicGwentState(state, viewerId)` + `expectedViewerId(state)` (a MulliganScreen már meglévő "ki még nincs kész" logikájának kiemelése, hogy a hot-seat pass-gate is használhassa).
- **`src/shared/games/gwent/engine/specialCardIds.ts`**: `HIDDEN_CARD_DEF_ID` sentinel.
- **`src/shared/games/gwent/engine/initialState.ts`**: `createPlaceholderGwentState()` — 3 fogyasztó között megosztva (`GwentRoom`, `GwentOnlineGamePage`, `GwentGamePage` throwaway local transport) a "generalizálj a 2-3. felhasználáskor" elv szerint.
- **`src/server/core/GameRoom.ts`**: `afterSync()` opcionális hook (no-op default, 3 hívási pont a meglévő `syncState()` hívások után); `clientSlots` `private` → `protected` (egy alosztály saját, slot-alapú üzenet-handlerének is kelleni tud).
- **`src/server/games/gwent/GwentRoom.ts`** (új): `OpaqueGameStateSchema`, `'submitDeck'`/`'requestPrivateSync'`/`'requestDeckReveal'` egyedi üzenetek (utóbbi a `DECK_SEARCH_ABILITIES` + `canActivateLeaderAbility` kettős kapuval, ld. 4.6), akció-tudatos `isActionAllowed` (ld. 4.4 pontosítás), 2-fázisú `isValidAction` (komplexitás-limit miatt szétbontva, a Hotel `isValidMovementOrPropertyAction`/... mintájára).
- **`src/server/index.ts`**: `gameServer.define('gwent', GwentRoom).enableRealtimeListing()`.
- **`src/client/games/gwent/ui/GwentOnlineTransport.ts`** (új), **`GwentOnlineGamePage.tsx`** (új, `requestDeckReveal` a `'requestDeckReveal'`/`'deckRevealed'` hálózati körutat implementálja).
- **`src/client/games/gwent/ui/GwentGamePage.tsx`**: opcionális `transport`/`myPlayer`/`onRequestDeckReveal` prop-hármas (Hotel/Dáma/Ramses mintája, kiegészítve) + `activeViewerId` állapotgép + `PassDeviceScreen.tsx` (új) + helyi módú `requestDeckReveal` alapértelmezés (szinkron, a valódi helyi state-ből).
- **`src/client/games/gwent/ui/board/{MulliganScreen,StartingChoiceScreen,MatchBoard}.tsx`**: opcionális `myPlayer` prop, "várakozás…" nézet, ha nem a helyi játékos van soron (ld. 5. szakasz pótlólagos munka); `MatchBoard` a `requestDeckReveal`-t is átadja tovább.
- **`src/client/games/gwent/ui/board/LeaderAbilityPanel.tsx`**: `requestDeckReveal` prop + `revealedDeck` átmeneti React state a 2 pakli-céljú képességhez (ld. 4.6) — a `player.deck` közvetlen olvasása megszűnt.
- **`src/client/games/gwent/ui/board/{CardTile,HandArea}.tsx`**: `HIDDEN_CARD_DEF_ID`-őr, kártyahát-megjelenítés (`matchBoard.module.css` `.cardBack`).
- **`src/client/shell/routes.tsx`/`gamesRegistry.ts`**: regisztrálva.

## 9. Ellenőrzés

- `npm run test:gwent` / `npm run test` (teljes projekt) — **391/391 zöld**, a `rules.test.ts` új `describe('toPublicGwentState', ...)`/`describe('expectedViewerId', ...)` blokkjaival (saját kéz/mulligan-halmaz érintetlen, ellenfélé maszkolt azonos hosszal, a `deck` MINDIG maszkolt, a tulajdonosának is; `viewerId: null` mindent maszkol; board/discard/log változatlan).
- `tsc --noEmit` (kliens), `typecheck:server`, `eslint .` (teljes projekt), `npm run build` (`vite build`, code-splitting ellenőrizve: `GwentOnlineGamePage` külön chunk-ba kerül, nem a fő bundle-be) — mind zöld/hibamentes (csak a projektben mindenütt jelenlévő, elfogadott `*GamePage`/orchestrator-komponens komplexitás-figyelmeztetések, 0 hiba).
- **Élő, 2-kliens smoke teszt** (`temp/gwent-multiplayer-smoke-test.ts`, valódi szerver + Postgres + 2 valódi Colyseus-kliens, a Hotel/Ramses-mintát követve, KÉTSZER lefuttatva — a deck-maszkolás véglegesítése előtt és után is) — mind zöld:
  - `ready` helyesen `false` → `true` 1/2 → 2/2 csatlakozásnál, helyes slot-kiosztás (`player-1`/`player-2`).
  - Placeholder állapot (0 kártyás kéz) amíg egyik/mindkét deck hiányzik; a valódi parti csak MINDKÉT `'submitDeck'` után indul (10 lapos kéz, `MULLIGAN` fázis).
  - **A döntő tulajdonság**: a nyilvánosan szinkronizált (Schema-n átmenő) állapotban SOSEM jelenik meg egyik fél valódi keze sem a másik fél kliensén — mindkét oldalon `HIDDEN_CARD_DEF_ID`. A saját valódi kéz (10 lap, valódi `defId`-kkel) kizárólag a `'privateHand'` privát csatornán érkezik meg.
  - **A pakli MÉG A SAJÁT kliensén is maszkolt** a normál szinkronizált állapotban — közvetlenül igazolva (`afterFlip.players[0].deck.every(defId === '__hidden__')` A saját kliensén).
  - **A `requestDeckReveal`/`deckRevealed` eseti felfedés** — A (Eredin Commander of the Red Riders vezérrel, jogos aktiválási pillanatban) valódi, nem-üres, valódi `defId`-kkel rendelkező paklit kap vissza; B (más vezérrel) kérése csendben figyelmen kívül marad (nincs válasz 500 ms-en belül).
  - `isActionAllowed` élesben elutasítja, ha B kliens `player-1` nevében próbál akciót küldeni (a state nem változik).
  - Egy teljes `CONFIRM_MULLIGAN` (mindkét oldal) → `FLIP_STARTING_COIN` szekvencia helyesen szinkronizálódik `AWAITING_START_CHOICE`-ból `ROUND_IN_PROGRESS`-ba mindkét kliensen.
  - Megfigyelt, ártalmatlan jelenség: a `'privateHand'` üzenet már a placeholder-fázisban (üres kézzel) elindul minden `afterSync()`-nél, mielőtt a kliens feliratkozna rá — a colyseus.js ilyenkor egy figyelmeztetést ír a konzolra ("onMessage() not registered"), de funkcionálisan ártalmatlan (a valódi, releváns üzenetek a feliratkozás UTÁN érkeznek, ahogy az assertek is igazolják).
- **Amit ez a kör NEM fedett le**: valódi böngészős (Playwright) UI-teszt a teljes online folyamatra (deck-építés → mulligan → lapjátszás → egy pakli-kereső vezér-képesség aktiválása a `GwentOnlineGamePage` UI-n keresztül) — a fenti smoke teszt a Colyseus-protokoll szintjén ellenőriz, nem a renderelt UI-n. Ugyanígy nem lett élőben tesztelve a helyi hot-seat `PassDeviceScreen` mechanika, sem a helyi módú `requestDeckReveal` alapértelmezés (a `expectedViewerId`/`toPublicGwentState` logika unit-teszt szinten igen). Reconnection (`RECONNECTION_WINDOW_SECONDS`) sem lett élőben végigjátszva Gwentre — a `GameRoom`-beli mechanizmus game-agnosztikus és már bizonyítottan működik a másik 3 játéknál, de a `'privateHand'` friss állapotának újracsatlakozás utáni pontos időzítése (érkezik-e időben, mielőtt a kliens renderelne) nincs élőben igazolva.
