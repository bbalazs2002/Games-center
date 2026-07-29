# Fázis 0b — Specifikáció: Multiplayer réteg (Colyseus, auth, lobby, letöltéskezelő)

**Státusz:** Implementálva, manuálisan tesztelve, és a manuális teszt által feltárt hibák javítva (2026-07-22) — auth (invite-code → JWT), Colyseus `GameRoom`/`DamaRoom`, `ColyseusGameTransport`, valós idejű Lobby (`LobbyRoom`), `src/shared`/`client`/`server` migráció, Prisma+PostgreSQL (Docker), `tsc`/`eslint`/`vitest`/`vite build` mind zöld mindkét oldalon. **Két-kliens state-szinkronizáció Node-szkripttel verifikálva** (lásd 11. szakasz) — a state-sync egy komoly, a korábbi típus-szintű tesztelésen átcsúszó hibája is kiderült és javítva lett eközben. Élő böngészős (két külön ablak/felhasználó) manuális teszt a javítások után **még nem történt újra** — érdemes még egyszer végigmenni rajta.
**Utolsó frissítés:** 2026-07-24 — 16. szakasz: újracsatlakozás implementálva és élesben ellenőrizve (lásd lent)
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md), [dama-0a-specifikacio.md](./dama-0a-specifikacio.md)

## 1. Cél és hatókör

**Döntés (2026-07-22):** a teljes Fázis 0b csomag a hatókör — nem csak a Colyseus mag, hanem auth (meghívó-kód + név), valódi lobby, és letöltéskezelő (SW cache + PWA) is.

**Hatókörben van:**
- `src/` átrendezése `shared/` / `client/` / `server/` alá
- PostgreSQL adatmodell (felhasználók, meghívó-kódok, játék-munkamenetek)
- Meghívó-kód alapú auth, JWT munkamenet
- Colyseus szerver: game-agnosztikus `GameRoom` alaposztály + `DamaRoom`
- `ColyseusGameTransport` (kliens) — a meglévő `GameTransport` interfész új implementációja
- Lobby UI: bejelentkezés, játék-választás, szoba létrehozás/csatlakozás
- Letöltéskezelő: Service Worker cache + PWA telepíthetőség, játékonként ki-/bekapcsolható

**Nincs hatókörben (külön, jövőbeli téma):** valódi jelszavas/OAuth auth, horizontális skálázás (több szerver-instance), spectator mód, játék-történet/statisztika UI.

**Amit ez a terv NEM változtat meg:** a Dáma **reducer nem változik** — pontosan ugyanaz a `reducer.ts`/`rules.ts`/`selectors.ts` fog futni a szerveren authoritatívan, mint eddig a kliensen futott lokálisan. Ez volt a Fázis 0a/1 tervezésének explicit célja (lásd `Projekt-conception.md`, "Kiegészítő elv"), és ez a terv ezt az ígéretet váltja valóra.

## 2. Magas szintű topológia

Lásd: [`docs/diagrams/multiplayer-topology.puml`](./diagrams/multiplayer-topology.puml)

Egyetlen Node.js szerver-processz, két réteggel ugyanabban a HTTP szerverben:
- **Express REST API** — auth (meghívó-kód beváltás → JWT), lobby-kiegészítő végpontok, ha a Colyseus natív matchmaking nem elég.
- **Colyseus** — WebSocket-alapú real-time réteg, saját `http.Server`-re csatlakoztatva ugyanarra a portra, mint az Express (Colyseus natívan támogatja ezt: `colyseus.Server({ server: httpServer })`).

Egyetlen **PostgreSQL** adatbázis mindkettő alatt.

**Deploy-feltételezés (megerősítésre vár):** egyetlen szerver-instance, nincs horizontális skálázás/Redis-driver most — baráti/családi méretű terheléshez ez bőven elég. Ha ez változik, a Colyseus `driver`/`presence` cserélhető később a kódot érintő nagyobb átírás nélkül (ez a keretrendszer maga is így van tervezve).

## 3. Mappastruktúra: `shared` / `client` / `server`

**Fontos strukturális változás a Fázis 0a-hoz képest:** eddig minden `src/` alatt volt, mert csak kliens létezett. Most, hogy a Dáma reducer/rules/selectors/state/actions kódnak **mindkét oldalon** (kliensen optimista előrejelzéshez, ha lesz; szerveren authoritatívan) futnia kell, ez a kód nem tartozik tisztán se a klienshez, se a szerverhez — ezért egy harmadik, `shared/` gyökér kell neki. Ugyanaz az elv, mint a `core`/`games` szétválasztás (lásd Fázis 0a spec 2.5 szakasza), csak most egy új tengelyen: **kliens/szerver**, nem csak **game-agnosztikus/game-specifikus**.

```
src/
  shared/                         # Fut kliensen ÉS szerveren is — nulla React, nulla Colyseus, nulla DOM/Node függés
    core/
      types.ts                    # Reducer<S, A> — változatlan, ide költözik
    games/
      dama/
        engine/                   # state.ts, actions.ts, reducer.ts, rules.ts, selectors.ts, initialState.ts
                                   # — SZÓ SZERINT ugyanaz a kód, ami eddig client/games/dama/engine alatt volt
        engine/*.test.ts          # a Vitest tesztek is ide költöznek, változatlanul

  client/                         # A jelenlegi src/ tartalma, egy szinttel lejjebb — React/Vite/DOM kód
    core/
      transport/
        GameTransport.ts
        LocalGameTransport.ts
        ColyseusGameTransport.ts  # ÚJ — lásd 6. szakasz
        useGameTransport.ts
      controller/
        PlayerController.ts
        HumanController.ts
    renderers/
      grid-2d/
    ui-kit/
    games/
      dama/
        ui/
        ai/
    shell/
      App.tsx
      routes.tsx
      GameLoader.tsx
      gamesRegistry.ts
      auth/                       # ÚJ — lásd 5. szakasz
        LoginPage.tsx
        AuthContext.tsx
      lobby/                      # ÚJ — lásd 7. szakasz
        LobbyPage.tsx
      downloads/                  # ÚJ — lásd 8. szakasz
        DownloadManager.tsx
    main.tsx
    vite-env.d.ts

  server/                         # ÚJ — Node.js, sosem fut böngészőben
    core/
      GameRoom.ts                 # game-agnosztikus Colyseus Room alaposztály — lásd 6. szakasz
    games/
      dama/
        DamaRoom.ts
    auth/
      inviteCodes.ts
      jwt.ts
      authRoutes.ts               # Express router: POST /api/auth/redeem-invite
    db/
      prismaClient.ts             # PrismaClient singleton — a GameRoom időzített flush-hoz is ezt használja, lásd 6.4 szakasz
    index.ts                      # Express + Colyseus bootstrap, HTTP szerver indítása

prisma/                            # gyökér szinten, Prisma CLI konvenció szerint
  schema.prisma
  migrations/                     # `prisma migrate dev` generálja
```

**Build/tooling következmény:** két külön TypeScript "world" jön létre — a kliens DOM-libekkel fordul (Vite/böngésző), a szerver Node-libekkel (nincs DOM, van `@types/node`). Javasolt: `tsconfig.client.json` (a mai `tsconfig.json` tartalma, `include: ["src/client", "src/shared"]`) és `tsconfig.server.json` (`include: ["src/server", "src/shared"]`, `types: ["node"]`, nincs `"DOM"` lib). A gyökér `tsconfig.json` csak referenciákat tartalmaz a kettőre. A `vitest` config mindkét `shared`/`client` fát látja (a motor-tesztek `shared/`-be költöznek, nem érintettek).

**Migrációs lépés (implementáció, nem most):** a jelenlegi `src/*` tartalom szétosztása a fenti struktúra szerint — ez tisztán fájlmozgatás + import-útvonalak frissítése, a kód logikája nem változik. Részletes lépéslista a 9. szakaszban.

## 4. Adatmodell (PostgreSQL + Prisma)

Lásd: [`docs/diagrams/multiplayer-er-diagram.puml`](./diagrams/multiplayer-er-diagram.puml)

**Döntés (2026-07-22, felülírja a korábbi tervezetet):** **Prisma ORM**, nem nyers `pg` + kézzel írt SQL — a te indoklásod szerint (több jövőbeli játék, "profi adatkezelés") ez megéri a plusz réteget. A `prisma/schema.prisma` a séma egyetlen forrása; a `prisma migrate dev` generálja belőle a tényleges SQL-migrációkat (`prisma/migrations/` alá) és a típusos `@prisma/client`-et.

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model InviteCode {
  code      String    @id
  label     String
  maxUses   Int?
  usesCount Int       @default(0)
  expiresAt DateTime?
  createdAt DateTime  @default(now())
  users     User[]

  @@map("invite_codes")
}

model User {
  id          String              @id @default(uuid())
  displayName String
  inviteCode  String
  invite      InviteCode          @relation(fields: [inviteCode], references: [code])
  createdAt   DateTime            @default(now())
  sessions    GameSessionPlayer[]

  @@map("users")
}

model GameSession {
  id        String              @id @default(uuid())
  gameType  String
  status    String              @default("WAITING") // WAITING | IN_PROGRESS | FINISHED
  stateJson Json?               // a legutóbbi DamaState pillanatkép — lásd 6.4 szakasz
  createdAt DateTime            @default(now())
  endedAt   DateTime?
  players   GameSessionPlayer[]

  @@map("game_sessions")
}

model GameSessionPlayer {
  gameSessionId String
  userId        String
  playerSlot    String // pl. 'LIGHT' / 'DARK' — játékonként más lehet
  gameSession   GameSession @relation(fields: [gameSessionId], references: [id])
  user          User        @relation(fields: [userId], references: [id])

  @@id([gameSessionId, userId])
  @@map("game_session_players")
}
```

**Miért `stateJson` a `GameSession`-ben:** ez adja a szerver-újraindítás utáni helyreállítást és a kliens-újracsatlakozás alapját — de **nem minden lépésnél** íródik ide, hanem a `GameRoom` memóriában tartott állapotából egy időzített flush-sal, a DB-terhelés csökkentésére. Lásd 6.4 szakasz.

## 5. Auth & Lobby folyamat (meghívó-kód)

Lásd: [`docs/diagrams/multiplayer-auth-sequence.puml`](./diagrams/multiplayer-auth-sequence.puml)

1. Kliens: `LoginPage` — meghívó-kód + megjelenítendő név mezők.
2. `POST /api/auth/redeem-invite { code, displayName }`
   - Szerver ellenőrzi: `invite_codes` táblában létezik-e a kód, nem járt-e le, `uses_count < max_uses` (ha van limit).
   - Ha érvényes: létrehoz egy `users` sort (`display_name`, `invite_code`), `uses_count += 1`, aláír egy JWT-t (`{ userId, displayName }`, hosszú lejárat, pl. 30 nap).
   - Válasz: `{ token, user: { id, displayName } }`.
3. Kliens: a JWT-t `localStorage`-ban tárolja (`AuthContext`), minden ezutáni REST hívásnál `Authorization: Bearer <token>` fejléc, és Colyseus szoba-csatlakozásnál `client.joinOrCreate('dama', { token })` — a szerver a `onAuth` Colyseus hook-ban validálja ugyanazt a JWT-t.
4. **Nincs jelszó, nincs email-visszaigazolás** — a meghívó-kód maga a belépési küszöb; a JWT csak azt bizonyítja, hogy valaki egyszer érvényes kódot váltott be, nem személyazonosságot.

**Megerősítésre váró javaslat:** JWT stateless munkamenet (nincs külön `sessions` tábla, a szerver csak az aláíró kulcsot ismeri) — egyszerűbb, mint egy DB-backed session store, és a kockázati szint (baráti kör, nincs érzékeny adat) nem indokolja a session-visszavonás komplexitását. Ha egy meghívó-kódot vissza kell vonni, az `invite_codes` sor törlése/lejáratása megakadályozza az ÚJ beváltásokat, de a már kiadott JWT-k érvényesek maradnak a lejáratukig — ha ez nem elfogadható, jelezd, és áttervezzük DB-backed session-re.

## 6. Colyseus integráció — a `GameTransport` absztrakció hálózati oldala

Lásd: [`docs/diagrams/dama-room-class-diagram.puml`](./diagrams/dama-room-class-diagram.puml) és [`docs/diagrams/multiplayer-move-sequence.puml`](./diagrams/multiplayer-move-sequence.puml)

### 6.1 Kulcsdöntés: opaque JSON state, nem `@colyseus/schema` mezőnkénti tükrözés

A Colyseus natív erőssége a `@colyseus/schema`-alapú állapot-szinkronizáció (bináris diff, csak a változott mezőket küldi újra) — ehhez viszont minden játéknak egy dekorátorokkal ellátott, kézzel megírt `Schema` osztályt kellene tartania, ami **tükrözi** a `DamaState`-et, de attól függetlenül karbantartandó (két hely, ahol a state alakja le van írva → DRY-sértés, és pont az a fajta duplikáció, amit a `shared/games/dama/engine` bevezetésével el akarunk kerülni).

**Döntés:** a szerver-oldali `GameRoom<TState, TAction, TPlayerSlot>` egyetlen, valóban game-agnosztikus `Schema`-t használ — egy JSON string mezőt —, és a teljes `TState`-et ebbe szerializálja minden változáskor.

> **Implementálva (2026-07-22) — kódrészlet helyett hivatkozás:** a tényleges implementáció (`src/server/core/GameRoom.ts`, `src/server/games/dama/DamaRoom.ts`) bővebb, mint az itteni eredeti vázlat — tartalmazza a 6.3 szakaszban leírt `isPlayersTurn`/`isValidAction` védelmet, a 6.4 szakasz szerinti perzisztenciát, és a `GameSessionPlayer` rekord létrehozását `onJoin`-kor. A doc-duplikáció elkerülése végett a friss kódot a forrásfájlokban érdemes megnézni, nem itt újra beilleszteni — az alábbi két pont a lényegi, változatlan elveket foglalja össze:
>
> - `@colyseus/schema` **dekorátor-alapú** `@type('string') stateJson = ''` szintaxisa **nem futott megbízhatóan** `tsx`/esbuild alatt (futásidejű hiba: `Cannot read properties of undefined`) — a kód a keretrendszer dekorátor nélküli `defineTypes(OpaqueGameState, { stateJson: 'string' })` API-ját használja helyette. Funkcionálisan ekvivalens, csak a regisztráció módja más.
> - A `GameRoom` generikus harmadik típusparamétere (`TPlayerSlot`) és két új abstract metódusa (`assignPlayerSlot`, `isPlayersTurn`) menet közben derült ki szükségesnek — lásd 6.3 szakasz.

**Tudatos tradeoff:** elveszítjük a bináris diff-szinkronizáció hálózati hatékonyságát (minden lépésnél a teljes state újraküldődik, nem csak a változás). Egy dáma-állapot JSON-je pár száz bájt — ezen a léptéken ez a veszteség irreleváns, cserébe a szerver-oldali `core` réteg **ugyanazt a game-agnosztikus tesztet állja ki**, mint a kliens-oldali (`GameRoom` működne változtatás nélkül Hotel-re is, csak a `reducer`/`createInitialState` cserélődik).

**Amit ez a döntés valójában megoszt a kliens és a szerver között (pontosítás 2026-07-23, a te kérdésedre válaszul):** nem a `DamaState` (vagy bármelyik jövőbeli játék state-jének) alakját — az továbbra is **kizárólag egy helyen** van leírva, a `shared/games/<game>/engine/state.ts`-ben. Amit meg kell osztani, az csak a **boríték** alakja (`{ stateJson: string }`, `src/shared/core/OpaqueGameStateSchema.ts`) — ez egyetlen, játék-független osztály, amit MINDEN játék ugyanúgy használ, nem játékonként egyet. Ez az eredeti DRY-célt (a state alakja csak egy helyen legyen leírva) nem sérti — pont ezt akartuk elkerülni azzal, hogy nem mezőnkénti `@colyseus/schema`-t választottunk játékonként.

> ⚠️ **Jövőbeli teendő, ha egy komplexebb/nagy state-ű játék (pl. Star Trek Fleet Captains) mezőnkénti bináris diffet igényelne:**
>
> A Colyseus **valóban képes** mezőnkénti szinkronizációra (csak a ténylegesen változott mezők mennek át a hálózaton, nem a teljes state) — ehhez viszont az adott játék state-jét **saját, kézzel megírt `@colyseus/schema` osztályban** kellene újra leírni, minden mezőt `@type(...)`-tal (vagy `defineTypes`-szal) annotálva. Ez a duplikáció (a state alakja egyszer a `shared/games/<game>/engine/state.ts` TypeScript típusaiban, egyszer egy párhuzamos Schema-osztályban) pontosan az, amit a jelenlegi opaque-JSON döntéssel elkerülünk — egy ilyen játéknál tudatosan kellene vállalni ezt a duplikációt a hálózati hatékonyságért cserébe.
>
> **A specifikáció korábbi verziója azt állította, hogy ez "az adott játékon belül felülírható" — ez pontatlan volt.** A jelenlegi `GameRoom<TState, TAction, TPlayerSlot>` implementáció (`src/server/core/GameRoom.ts`) a Colyseus `Room` state-generikáját **hardcode-olva** az `OpaqueGameStateSchema`-ra köti (`extends Room<OpaqueGameStateSchema, unknown, unknown, AuthPayload>`) — egy leszármazott `DamaRoom`/`HotelRoom` NEM tud egyszerűen más state-típust adni, mert ez nincs kitéve típusparaméterként. Ha ez a helyzet ténylegesen felmerül egy jövőbeli játéknál, ezt előbb meg kell tervezni: pl. a `GameRoom` egy negyedik generikus paramétert kapna a Colyseus state típusára, alapértelmezetten `OpaqueGameStateSchema`-ra, amit egy nagy state-ű játék felülírhatna a saját Schema-jával — ezzel együtt a `ColyseusGameTransport` opaque-JSON-t feltételező `JSON.parse(networkState.stateJson)` dekódolása is átépítésre szorulna arra a játékra. **Ez tehát tervezési munka, nem egysoros módosítás — érdemes erre külön időt szánni, mielőtt egy nagy/komplex játék (klaszter F vagy I) multiplayer-integrációja elkezdődik.**

### 6.2 Kliens: `ColyseusGameTransport`

```typescript
// src/client/core/transport/ColyseusGameTransport.ts
import type { Room } from 'colyseus.js';
import type { GameTransport } from './GameTransport';

interface OpaqueRoomState {
  stateJson: string;
}

export class ColyseusGameTransport<TState, TAction> implements GameTransport<TState, TAction> {
  private state: TState;
  private readonly listeners = new Set<(state: TState) => void>();

  constructor(private readonly room: Room<OpaqueRoomState>, initialState: TState) {
    this.state = initialState;
    room.onStateChange((networkState) => {
      this.state = JSON.parse(networkState.stateJson) as TState;
      this.listeners.forEach((listener) => listener(this.state));
    });
  }

  getState(): TState {
    return this.state;
  }

  dispatch(action: TAction): void {
    this.room.send('action', action);
  }

  subscribe(listener: (state: TState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
```

**Ez a lényeg, amiért az egész Fázis 0a/1 tervezés megérte:** a `DamaGamePage` komponens **nem változik** — csak azt kell cserélni, ahogy a `transport` létrejön (`new LocalGameTransport(reducer, createInitialState())` helyett `new ColyseusGameTransport(room, initialState)`), mert mindkettő ugyanazt a `GameTransport<DamaState, DamaAction>` interfészt implementálja. A `useGameTransport` hook, a `getValidMoves`/`getMovablePositions` selectorok, a kattintás-logika — semmi nem tud arról, hogy hálózaton keresztül fut-e.

A `DamaGamePage`-nek egy módra lesz szüksége a transport-forrás kiválasztására (pl. egy `transportFactory` prop vagy egy React Context, amit a route állít be attól függően, hogy hot-seat vagy multiplayer módban nyitották meg) — ennek pontos API-ját a Fázis 0b implementáció első lépéseként érdemes eldönteni, ez már kódolási részletkérdés, nem architektúra.

**Implementálva (2026-07-22):** `DamaGamePage` egy opcionális `transport` propot kapott (`DamaGamePageProps`) — ha hiányzik, belül épít egy `LocalGameTransport`-ot (hot-seat, változatlan viselkedés); ha kapja, azt használja. Egy új `DamaOnlineGamePage` komponens csatlakozik a Colyseus room-hoz (`client.joinById`), és ezzel a proppal rendereli a meglévő `DamaGamePage`-et.

> ⚠️ **Build-regresszió, amit menet közben találtunk és javítottunk:** ha a routing (`routes.tsx`) *statikusan* importálja a `DamaOnlineGamePage`-et (és rajta keresztül a `DamaGamePage`-et/engine-t), a Rollup a fő bundle-be olvasztja őket, és elvész a `GameLoader` dinamikus `import()`-jának code-splitting előnye — a hot-seat és a multiplayer route ugyanahhoz a modulhoz vezet, és a build-elemző csak azt látja, hogy VAN egy statikus út is oda. A megoldás: `routes.tsx`-ben `lazy(() => import('../games/dama/ui/DamaOnlineGamePage'))`, nem statikus import, `<Suspense>`-be csomagolva. Ez minden jövőbeli, több belépési pontú (hot-seat + online) játéknál visszatérő buktató — érdemes lesz erre külön figyelni, ha Sakk/Malom is multiplayer-képes lesz.

### 6.3 Anti-cheat megjegyzés

> **Pontosítás implementáció közben (2026-07-22):** az eredeti tervezet csak a reducer szabály-validációjára hivatkozott — ez igaz, de **önmagában nem elég**. A reducer azt ellenőrzi, hogy a lépés szabályos-e, de nem azt, hogy *ki küldte* — hálózaton bárki bármelyik szoba-kliens sessionId-jével küldhetne `MOVE` action-t az ellenfele nevében is, amíg `state.currentPlayer`-ének bábuja mozog. Ezt a `GameRoom` szintjén kellett lezárni, nem a reducerben (a reducer marad game-logika-tiszta, nem hálózati identitást ellenőriz).

Két réteg védi a szobát ténylegesen:

1. **Alak-ellenőrzés** (`isValidAction`): mielőtt bármi a reducerhez kerülne, a `GameRoom` leellenőrzi, hogy az érkező `action` egyáltalán a várt alakú-e (pl. `{ type: 'MOVE', from: {row,col}, to: {row,col} }`) — a hálózat nem megbízható bemenet, egy hibás/rosszindulatú payload helyi hot-seat módban sosem fordulhatott elő (a UI mindig jól formázott action-t épített), de hálózaton igen. Játékonként implementált (`DamaRoom.isValidAction`), mert az action alakja is játék-specifikus.
2. **Player-slot ellenőrzés** (`isPlayersTurn`): a `GameRoom` `onJoin`-kor minden csatlakozó klienshez hozzárendel egy player-slotot (`clientSlots: Map<sessionId, TPlayerSlot>`), és `onMessage('action', ...)`-nál eldobja az action-t, ha a küldő kliens slotja nem egyezik azzal, aki éppen léphetne. Ez is játékonként implementált (`DamaRoom.isPlayersTurn`: `state.currentPlayer === playerSlot`), mert a "kinek a köre van" fogalma a state alakjától függ, amit a `GameRoom` generikusan nem ismerhet.

Mindkettő **game-agnosztikus szerződésként** (abstract metódus) van a `GameRoom`-on, game-specifikus implementációval a `DamaRoom`-ban — ugyanaz a minta, mint a `reducer`/`createInitialState`. Csak ezután fut le a reducer, ami a szabályokat validálja.

### 6.4 Perzisztencia: nincs külön cache-szolgáltatás — a `GameRoom` memóriája a "forró út"

**Döntéstörténet (dokumentálva, ahogy kérted):** ebben a szakaszban eredetileg egy kétszintű, memcached write-through cache-t terveztünk (forró út: minden action után memcached-be írás; hideg út: időzített flush Postgres-be), mert a kör-végi mentés nem lett volna elég a jövőbeli, kör-közbeni interakciót is használó játékokhoz. **Felülvizsgálat (2026-07-22):** átgondolva kiderült, hogy a memcached (vagy bármilyen külön cache-szolgáltatás) **redundáns** volt a saját korábbi topológia-döntésünkhöz képest — mivel egyetlen szerver-instance-ben állapodtunk meg (2. szakasz, nincs horizontális skálázás), a "forró út" szerepét már natívan betölti a Colyseus `GameRoom` saját, memóriában tartott `gameState` mezője: egy újracsatlakozó kliens ugyanahhoz a room-objektumhoz csatlakozik vissza, nincs szüksége külön cache-lookupra. Külön cache-szolgáltatás csak akkor adna hozzáadott értéket, ha (a) több szerver-instance osztozna az állapoton, vagy (b) a szerver-restart *közbeni* pillanatra is kellene gyors hozzáférés — egyik sem áll fenn most. **Döntés: a cache-réteg törölve, a terv egyszerűsítve.**

- **Forró út (minden action után, már eddig is megvolt):** a `GameRoom.syncState()` frissíti a Colyseus `state.stateJson`-t (broadcast a klienseknek) — ez maga a "forró", memóriában élő állapot, nincs mellé külön írandó cache.
- **Hideg út (időzítve, aszinkron):** egy debounce-olt/időzített flush (pl. 5 másodpercenként, vagy X action után, vagy amikor a szoba kiürül/`onDispose`) közvetlenül a `this.gameState`-ből ír a `GameSession.stateJson`-be Prisma-n keresztül — ez adja a szerver-újraindítás utáni tartós helyreállítást, pontosan úgy, mint korábban, csak a memcached köztes lépés nélkül.
- **Tervezési következmény (változatlan):** ha a szerver összeomlik két flush között, legfeljebb a flush-intervallumnyi (pl. 5 mp-nyi) legutóbbi lépés veszhet el a Postgres-ből. Amíg a szerver-processz fut (nincs összeomlás), ez az ablak irreleváns, mert a `GameRoom` memóriája a forrás, nem a DB. Ez egy tudatosan elfogadott, dokumentált kompromisszum, nem hiba.
- **Egyszerűsödés a mappatervben:** a korábban tervezett `src/server/db/gameSessionCache.ts` **törölve** — a `GameRoom` közvetlenül a `src/server/db/prismaClient.ts`-t használja az időzített flush-hoz, nincs külön cache-kliens réteg.
- **Fejlesztői környezet:** a helyi `docker-compose.yml`-ből is kikerül a memcached szolgáltatás, csak `postgres` marad benne (lásd 9. szakasz).
- **Ha később mégis kellene egy külön cache/pub-sub réteg** (pl. horizontális skálázás miatt), a 2. szakaszban már jelzett út érvényes: a Colyseus saját `driver`/`presence` absztrakciója Redis-re cserélhető — ezt a döntést nem kell most meghozni.

## 7. Lobby

> **Implementálva (2026-07-22) — API-korrekció:** a `client.getAvailableRooms('dama')` metódus **nem létezik** a ténylegesen telepített `colyseus.js@0.16` verzióban (régebbi Colyseus major verzióknak volt ilyen API-ja, de ez megváltozott). A tényleges, jelenlegi mechanizmus a beépített **`LobbyRoom`**: a kliens csatlakozik egy speciális `'lobby'` room-hoz egy szűrővel, és onnantól valós idejű `'rooms'` (kezdő lista) / `'+'` (új/frissült szoba) / `'-'` (eltűnt szoba) üzeneteket kap — ez jobb is, mint egy egyszeri lekérdezés, mert push-alapú.

- Bejelentkezés után a `LobbyPage` a meglévő `gamesRegistry`-ből listázza a játékokat (jelenleg csak Dáma).
- Szerver: `gameServer.define('lobby', LobbyRoom)` (a `LobbyRoom` a `colyseus` csomagból importált, kész osztály, nincs hozzá saját kód).
- Kliens: `client.joinOrCreate('lobby', { filter: { name: 'dama' } })`, majd `room.onMessage('rooms', ...)` / `room.onMessage('+', ...)` / `room.onMessage('-', ...)` a lista karbantartásához — nincs szükség egyedi "szoba-lista" REST végpontra.
- "Új szoba" gomb → `client.create('dama', { token })`, majd átirányítás `/games/dama/online/:roomId`-ra a kapott `room.roomId`-val.
- Meglévő szobához csatlakozás → a lobby-listából `roomId` ismeretében navigálás ugyanoda; a `DamaOnlineGamePage` a route paraméterből `client.joinById(roomId, { token })`-vel csatlakozik.
- **Újracsatlakozás:** **implementálva és élesben ellenőrizve (2026-07-24)** — lásd 16. szakasz.

## 8. Letöltéskezelő (Service Worker cache + PWA)

- `vite-plugin-pwa`, **`injectManifest`** módban (nem `generateSW`) — a `generateSW` mindent automatikusan precache-elne, ami ütközne a "játékonként külön letölthető/törölhető" alapkövetelménnyel (lásd `Projekt-conception.md`, Projekt célja).
- Egyedi service worker (`src/client/sw.ts`) minden játékhoz külön Cache Storage bucket-et kezel: `game-dama-v1`.
- `DownloadManager` UI komponens (a `HomePage`/`LobbyPage` mellett): minden `gamesRegistry` bejegyzéshez megjeleníti, hogy le van-e töltve; "Letöltés" gomb → a játék JS/CSS chunk-jait (amiket a `GameLoader` már dinamikusan importál, lásd Fázis 0a) explicit `caches.open(...).addAll([...])`-al gyorsítótárazza; "Törlés" gomb → `caches.delete('game-dama-v1')`.
- **Ez a rész lazábban van kidolgozva, mint az auth/multiplayer mag** — ha szeretnéd, egy külön körben mélyebbre megyünk (pontos cache-invalidálási stratégia verzióváltásnál, offline fallback UX stb.), most csak annyi a cél, hogy a mappastruktúrában és a tech stack-ben legyen neki helye.

## 9. Migrációs lépéslista (a következő implementációs kör feladata, nem ez a terv)

1. `src/{core,renderers,ui-kit,shell,main.tsx,vite-env.d.ts}` → `src/client/...`
2. `src/games/dama/engine/*` (és a hozzá tartozó tesztek) → `src/shared/games/dama/engine/*`
3. `src/games/dama/{ui,ai}` → `src/client/games/dama/{ui,ai}`
4. Minden érintett import-útvonal frissítése (elsősorban a relatív `../../../` láncok — ezek a mélyebb beágyazás miatt eggyel hosszabbak lesznek)
5. `tsconfig.json` szétbontása `tsconfig.client.json` / `tsconfig.server.json` + referenciák
6. `package.json`: `server` és `server:dev` scriptek (`tsx watch src/server/index.ts`), új függőségek: `colyseus`, `@colyseus/schema`, `express`, `prisma` + `@prisma/client`, `jsonwebtoken`, `colyseus.js` (kliens SDK)
7. `prisma init` + `prisma/schema.prisma` a 4. szakasz sémájával, `prisma migrate dev` az első migrációhoz
8. **Docker (megerősítve 2026-07-22, egyszerűsítve):** `docker-compose.yml` a gyökérben, egyelőre **csak** `postgres` szolgáltatással a helyi fejlesztéshez (a korábban tervezett memcached törölve, lásd 6.4 szakasz) — a teljes app (kliens build + szerver) konténerizálása egy **későbbi** kör témája, amikor éles telepítés kerül napirendre.

## 10. Nyitott pontok — mind lezárva (2026-07-22)

- [x] Egyetlen szerver-instance, nincs horizontális skálázás/Redis most (2. szakasz) — **megerősítve.**
- [x] Adatréteg: **Prisma ORM** a nyers `pg`+SQL helyett (4. szakasz) — a jövőbeli játékbővítés és a "profi adatkezelés" indokolja a plusz réteget.
- [x] JWT stateless munkamenet, nincs visszavonható session-tábla (5. szakasz) — **megerősítve**, nincs érzékeny adat, ami nagyobb biztonságot indokolna.
- [x] Opaque JSON state a Colyseus szinkronizációban (6.1 szakasz) — **megerősítve a Dámára**, explicit játékonkénti döntésként dokumentálva (lásd 6.1 kiegészítés).
- [x] PostgreSQL hosztolás: helyi **Docker-compose**, egyelőre csak az adatbázis — a teljes app konténerizálása későbbi, éles-telepítési téma.
- [x] `stateJson` mentési gyakoriság: **a `GameRoom` memóriája a forró út** (nincs külön cache-szolgáltatás — felülvizsgálva 2026-07-22, a memcached ötlet redundánsnak bizonyult az egyetlen-instance döntés mellett), Postgres időzített flush-sel a hideg úton. Lásd 6.4 szakasz.

## 11. Hibák a manuális teszt során — javítva (2026-07-22)

- **Új multiplayer szoba létrehozásakor:** a szoba létrejön, de `Invalid prisma.gameSessionPlayer.create() invocation ... Unique constraint failed on the fields: (gameSessionId,userId)` hiba jelenik meg.
  - **Ok:** a `LobbyPage.handleCreateRoom` már csatlakoztatott a `colyseusClient.create(...)` hívással (szerver-oldalon lefutott az `onJoin`, létrejött a `GameSessionPlayer` LIGHT slottal) — utána a navigáció a `DamaOnlineGamePage`-re vitt, aminek `useEffect`-je **még egyszer** csatlakozott ugyanazzal a JWT-vel (`joinById`) → ugyanaz a `userId` próbált egy MÁSODIK `GameSessionPlayer` sort létrehozni ugyanabban a `gameSessionId`-ban (most DARK slottal), ami sérti az `(gameSessionId, userId)` egyediségi megszorítást. A szoba-létrehozó ember véletlenül "duplán csatlakozott" önmagával.
  - **Javítás:** `LobbyPage` a `create()`-tel kapott, már élő `Room` objektumot React Router navigációs state-ként adja tovább (`navigate(path, { state: { room } })`); a `DamaOnlineGamePage` ha kap ilyet, azt használja fel újra-csatlakozás nélkül — csak akkor hív `joinById`-t, ha valaki a lobby-listából csatlakozik egy MÁSIK létrehozó szobájához (ott ez az első és egyetlen csatlakozás, helyes).
- **A multiplayer lobby-ból nem lehet kijelentkezni:** egyszerű hiányzó UI-elem volt — a `useAuth().logout()` funkció megvolt, de sehol nem volt hozzá gomb kötve. Javítva: `LobbyPage` fejlécében "Kijelentkezés" gomb, `/login`-ra navigál kijelentkezés után.

**Harmadik, súlyosabb hiba, amit a fenti javítás közben, a Node-szintű regressziós teszttel találtunk (nem a te manuális tesztedben jelentkezett, de ugyanabban a körben derült ki):** a multiplayer state-szinkronizáció **valójában soha nem működött** — minden kliens mindig üres kezdőállapotot látott, a lépések soha nem jelentek meg a másik oldalon. Ezt a korábbi curl/típus-ellenőrzés szintű tesztelés nem vette észre, mert azok nem futtattak le egy tényleges Colyseus state-decode-ot.

- **Ok:** `OpaqueGameState`/`OpaqueGameStateSchema` osztályban a `stateJson = '';` **class field inicializátor** (TypeScript `useDefineForClassFields`, ami ES2022+ target mellett alapértelmezett) egy **saját példány-property-t** hoz létre `Object.defineProperty`-vel, ami **elfedi** a `defineTypes`/`@type(...)` által a prototípuson beállított, változás-követő accessor-t. Emiatt a szerver-oldali `this.state.stateJson = JSON.stringify(...)` írások sosem jelentkeztek be "megváltozott mezőként" a Colyseus encoder felé — soha semmi nem ment át a hálózaton a kezdeti (üres) state után. Ez egy jól ismert, dokumentált buktató a TS class field + dekorátor/accessor-alapú keretrendszerek (pl. MobX, Colyseus schema) kombinációjánál.
- **Járulékos ok:** a kliens-oldali automatikus Reflection-alapú séma-felismerés (rootSchema megadása nélküli `create`/`joinById`) sem dekódolt megbízhatóan — ezért emellett bevezettünk egy explicit, `src/shared/core/OpaqueGameStateSchema.ts`-ben megosztott séma-osztályt, amit mindkét oldal ugyanúgy ismer, és amit a kliens harmadik (`rootSchema`) paraméterként ad át a `create`/`joinById` hívásoknak.
- **Javítás:** a mezőt inicializáló nélkül, `declare stateJson: string;` formában deklaráltuk — így nincs saját, elfedő instance-property, a `defineTypes` által beállított accessor az egyetlen implementáció. Verifikálva egy Node-szkriptes két-klienses regressziós teszttel (`temp/two-client-smoke-test.mjs`): szoba létrehozása, második kliens csatlakozása, egy lépés elküldése — a másik kliens oldalán a state ténylegesen frissült (`currentPlayer` LIGHT-ról DARK-ra váltott a JSON payloadban).
## 12. Negyedik hiba (2026-07-23, javítva) — `Room` objektum nem adható át router state-en keresztül

**Tünet, két hibaüzenet egyszerre, szoba létrehozásakor:**
1. Konzol-figyelmeztetés: `colyseus.js: onMessage() not registered for type 'rooms'`.
2. **Éles crash:** `Uncaught (in promise) DataCloneError: Failed to execute 'pushState' on 'History': function register(cb) {...} could not be cloned. at handleCreateRoom (LobbyPage.tsx:64:7)`.

**Gyökér-ok (a #1 hiba korábbi "javítása" volt hibás — ezt kell most helyesbíteni):** a 11. szakaszban leírt javítás azt eszközölte, hogy a `LobbyPage` a `create()`-tel kapott, már élő Colyseus `Room` példányt a React Router navigációs `state`-jén keresztül adja tovább (`navigate(path, { state: { room } })`), hogy a `DamaOnlineGamePage` ne csatlakozzon még egyszer. **Ez alapvetően hibás megközelítés volt:** `createBrowserRouter` a böngésző History API-ját használja, aminek a `pushState`-je a *structured clone* algoritmussal szerializálja a `state`-et — egy `Room` példány viszont WebSocket-kapcsolatot, EventEmittert, callback-függvényeket tartalmaz, ezek egyike sem klónozható. A hívás garantáltan elszáll, ez nem edge case, hanem minden egyes szoba-létrehozásnál lefutó, biztos crash.

A `#1-es "onMessage() not registered"` figyelmeztetés egy különálló, kisebb hiba: React StrictMode dev-módban duplán futtatja le a `LobbyPage` lobby-room-csatlakozás `useEffect`-jét; az első lefutás `cancelled`-ként végződik és a handlerek regisztrálása *előtt* hívott `room.leave()`-et, miközben a szerver már elküldte a kezdő `'rooms'` üzenetet — a kliens emiatt egy üzenettípusra nem talált regisztrált handlert.

**Javítás:**
- **Architektúra-váltás:** a `Room` objektum átadása helyett a `LobbyPage` "Új szoba" gombja most csak navigál egy speciális URL-re (`/games/dama/online/new`), NEM hív `create()`-et. A tényleges `client.create(...)` hívás a `DamaOnlineGamePage`-ben történik — ő ismeri fel a `'new'` route-paramétert, és utána `navigate(realRoomId, { replace: true })`-tal cseréli le az URL-t a valódi szoba-azonosítóra (megosztható/frissíthető link). Így **soha nem kell élő objektumot átadni komponensek között** — mindig csak egy string (roomId) az URL-ben.
- **Duplikált csatlakozás elkerülése emiatt is:** mivel a `'new'` → valódi `roomId` csere a `DamaOnlineGamePage` saját `navigate`-je miatt megváltoztatja a route-paramétert, ami újra lefuttatná a csatlakozó `useEffect`-et (és emiatt EGY MÁSODIK `joinById`-t hívna ugyanazzal a userrel — visszahozva a 11. szakaszban leírt unique constraint hibát!) — ezt egy `startedRef` ref-őr védi ki: a csatlakozási logika egy komponens-életciklusban csak egyszer futhat le, függetlenül attól, hányszor változik a `roomId`/`auth` paraméter utána. Ez a ref-őr egyben a React StrictMode dupla-lefutás ellen is védekezik.
- **LobbyPage lobby-room-csatlakozás:** az `onMessage` handlerek regisztrálása most **mindig megelőzi** a `cancelled` ellenőrzést — így egy StrictMode-os "fantom" lefutás sem hagyja figyelmeztetés nélkül a beérkező kezdő `'rooms'` üzenetet.
- **Új megosztott konstans:** `src/client/games/dama/onlineRoomConstants.ts` — szándékosan **külön fájlban**, nem a `DamaOnlineGamePage.tsx`-ben, mert a `LobbyPage`-nek is importálnia kell a `'new'` jelölő stringet, és egy statikus import a nehéz `DamaOnlineGamePage`/Dáma-engine modulra visszahozta volna a korábban már egyszer kijavított code-splitting regressziót (lásd 6.2 szakasz "Build-regresszió" jegyzet).
- **Ellenőrizve:** `tsc`, `eslint`, `vite build` (a code-splitting chunk-ok mérete változatlan — `DamaOnlineGamePage` továbbra is külön chunk), és a `temp/two-client-smoke-test.mjs` két-klienses regressziós teszt újra lefuttatva, változatlanul sikeres. **Élő böngészős (két külön ablak) teszt erre a konkrét javításra még nem történt** — a create-gomb → lobby → csatlakozás teljes útvonalat érdemes még egyszer manuálisan végigpróbálni.

## 13. Kiegészítések a te visszajelzésed alapján (2026-07-23)

**Menü/routing átalakítás:** a navigáció most kétlépcsős — `/` (HomePage) csak a játékokat listázza (`GAMES_REGISTRY`-ből), rákattintva a `/games/:gameId` (`GameModeSelectPage`) mutatja a "Egyjátékos" / "Multiplayer" választást. Ez a jövőbeli játékokra (Hotel stb.) is felkészít anélkül, hogy most bármit túltervezőnk — az útvonalak:
- `/games/:gameId` → `GameModeSelectPage` (mód-választás)
- `/games/:gameId/local` → `GameLoader` (hot-seat, változatlan)
- `/games/:gameId/lobby` → `LobbyPage` (auth-gated, most `gameId`-t olvas paraméterből a korábbi hardcode-olt `'dama'` helyett — ez tette lehetővé, hogy a Colyseus lobby-szűrő és a `create`/`joinById` hívások is a kiválasztott játékra vonatkozzanak)
- `/games/dama/online/:roomId` → `DamaOnlineGamePage` (egyelőre Dáma-specifikus, lásd 6.2 szakasz indoklás)

**Mellékesen talált és javított regresszió:** a menü-átalakítás során kiderült, hogy a `LoginPage` sikeres bejelentkezés után a már nem létező `/lobby` útvonalra navigált (a régi, játék-független lobby route-ra, amit a fenti átalakítás megszüntetett). Javítás: a `RequireAuth` most a `location.pathname`-et `state.from`-ként adja át a `/login`-nak, és a `LoginPage` sikeres belépés után oda navigál vissza (vagy `/`-re, ha nincs ismert cél) — ez a szokásos "redirect back after login" minta, és mellékesen jobb UX-et is ad, mint a korábbi mindig-egy-helyre-navigálás.

**"Te vagy: Világos/Sötét" kijelzés:** a szerver `GameRoom.onJoin`-ban `client.send('yourSlot', slot)`-tal elküldi a csatlakozó kliensnek a saját player-slotját (ez korábban csak szerver-oldalon volt ismert). A `DamaOnlineGamePage` erre feliratkozik, és átadja `DamaGamePage`-nek egy új, opcionális `myPlayer` propon keresztül — hot-seat módban nincs `myPlayer` (mindkét oldal ugyanaz a személy), online módban megjelenik a "Te vagy: ..." sor a kör-jelző fölött.

**Várakozás az ellenfélre:** az `OpaqueGameStateSchema` kapott egy második, game-agnosztikus mezőt: `ready: boolean` (ugyanazzal a "declare, inicializáló nélkül" mintával, mint `stateJson` — lásd 11. szakasz, a bug ott ismét előjönne inicializáló hozzáadásával). A `GameRoom` `onCreate`-kor `false`-ra állítja, `onJoin`-ban `true`-ra vált, amint `joinCount >= maxClients`. A `DamaOnlineGamePage` egy külön `room.onStateChange` feliratkozással követi ezt (a `ColyseusGameTransport`-tól függetlenül, mert a "szoba kész-e" játék-agnosztikus, transport-szintű infó, nem game state — nem szennyezi a `GameTransport` interfészt, amit a hot-seat mód is használ), és amíg `!ready`, "Várakozás az ellenfélre…" felirat jelenik meg a tábla helyett.

**Ellenőrizve:** `tsc`, `eslint`, `vitest`, `vite build` (code-splitting sértetlen), és a kibővített `temp/two-client-smoke-test.mjs` — mostantól azt is assertálja, hogy `ready` helyesen `false`→`true` vált, és hogy mindkét kliens a helyes `yourSlot` üzenetet kapja (`LIGHT`/`DARK`). **Élő böngészős teszt ezekre a funkciókra még nem történt.**

## 14. Kiegészítések a te visszajelzésed alapján (2026-07-23, második kör)

**Ellenfél körében nincs kijelölés/kattintás:** korábban `DamaGamePage` a kiemelést és a bábu-kiválasztást kizárólag `state.currentPlayer` alapján döntötte el — ez hot-seat módban helyes (mindkét oldal ugyanaz a személy a képernyőnél), de online módban hibás volt: ha pl. LIGHT vagyok és DARK-ra került a kör, egy DARK bábura kattintva a `piece.player === state.currentPlayer` feltétel (DARK === DARK) igaznak bizonyult, és megmutatta az ellenfél lehetséges lépéseit. Javítás: bevezettünk egy `isMyTurn = !myPlayer || myPlayer === state.currentPlayer` feltételt (hot-seat módban `myPlayer` nincs megadva, tehát mindig igaz — a viselkedés ott változatlan), és minden kiemelés/kattintás-kezelés ez mögé lett kapuzva. A refaktor során a komponens ESLint komplexitási limitjét is túllépte — a logikát tiszta, névvel ellátott függvényekre (`isPlayersTurnToAct`, `computeValidMoves`, `computeHighlightedSquares`) bontottuk szét.

**Szoba-azonosító a várakozó képernyőn:** a "Várakozás az ellenfélre…" szöveg mellett most megjelenik a szoba tényleges Colyseus `roomId`-ja is, hogy a szoba létrehozója meg tudja osztani a másik játékossal. Ezt nem a `roomId` route-paraméterből olvassuk (ami a `'new'` → valódi azonosító cserénél egy renderelési körig még a régi értéket mutathatná), hanem közvetlenül a `connect.then((room) => ...)` callback-ben kapott `room.roomId`-ból, egy külön `connectedRoomId` state-be mentve — ez garantáltan a helyes, végleges azonosítót mutatja, függetlenül az URL-csere pontos időzítésétől.

**Ellenőrizve:** `tsc`, `eslint` (a komplexitási figyelmeztetés is megszűnt), `vitest`, `vite build`. **Élő böngészős teszt ezekre a konkrét változtatásokra még nem történt** — a Node-szkriptes smoke teszt nem alkalmas React-UI viselkedés (kiemelés, kattintás-tiltás) ellenőrzésére.

## 15. Ötödik hiba (2026-07-24, javítva) — a lobby-lista sosem frissült élőben

**Tünet (a te teszteden találva):** a lobby oldalon a "Nyitott szobák" lista nem frissült — ha valaki a lobby oldalon ülve hozott létre egy másik szobát, vagy egy szoba betelt/eltűnt, ez nem jelent meg a már nyitva lévő listában, csak oldal-újratöltés/újranavigálás után.

**Gyökérok:** a `LobbyPage` a Colyseus beépített `LobbyRoom`-jára épül, ami a '+'/'-' valós idejű üzeneteket a `RegisteredHandler.enableRealtimeListing()` hívás nélkül **soha nem küldi el** — enélkül a `dama` szoba `create`/`join`/`leave`/`lock`/`unlock`/`dispose`/`visibility-change` eseményei nem publikálódnak a lobby belső `$lobby` presence-csatornájára, tehát a `LobbyRoom` csak azt az egyszeri pillanatfelvételt (`matchMaker.query(...)`) tudja elküldeni, amikor egy kliens csatlakozik hozzá — utána semmit. Ez a hiba a Fázis 0b eredeti `src/server/index.ts`-ében már a `gameServer.define('dama', DamaRoom)` regisztrációtól kezdve jelen volt, csak eddig nem tűnt fel (a smoke tesztek a szoba `state`-jét ellenőrizték, nem a lobby-lista élő frissülését).

**Javítás:** `gameServer.define('dama', DamaRoom).enableRealtimeListing();` — a `.define()` visszatérési értéke (`RegisteredHandler`) ezt a metódust láncolva kínálja. **Minden jövőbeli játék szoba-regisztrációjánál is szükséges lesz ez a lánc**, ha azt is a közös `LobbyPage`/`LobbyRoom` mechanizmus listázza — érdemes ezt egy közös helyen (pl. egy `defineGameRoom()` segédfüggvényben) rögzíteni, ha 2+ játék regisztrálására kerül sor, hogy ne felejtődjön el újra.

**Ellenőrizve:** élő szerver ellen futtatott új smoke teszttel (`temp/lobby-realtime-listing-check.ts`) — egy már csatlakozott lobby-kliens ténylegesen megkapja a '+' üzenetet egy utólag létrehozott szobáról, és a '-' üzenetet, amikor az a szoba betelik.

## 16. Újracsatlakozás (2026-07-24, implementálva)

**Kérés:** a Dáma proof-of-concept elkészülte után a te választásod alapján a hátralékból ez lett a következő kör — ha egy admitolt (szlottal rendelkező) játékosnak megszakad a kapcsolata (WiFi, telefon lezáródik, tab véletlen bezáródik), ne essen ki véglegesen a partiból.

### 16.1 Szerver-oldali mechanizmus

A Colyseus `Room.allowReconnection(client, seconds)` API-ját `GameRoom.onLeave`-ben hívjuk meg, de **csak akkor, ha a klienshez már van kiosztott player-slot ÉS a lecsatlakozás nem szándékos** (`consented === false` — ezt a Colyseus abból állapítja meg, hogy a kliens küldött-e explicit `LEAVE_ROOM` üzenetet a kapcsolat zárása előtt; egy hirtelen hálózat-megszakadás sosem küld ilyet).

```typescript
async onLeave(client: Client, consented: boolean): Promise<void> {
  // ... pendingRequests takarítás, változatlan ...

  const slot = this.clientSlots.get(client.sessionId);
  if (!slot || consented) return;

  this.broadcast('opponentDisconnected', { slot }, { except: client });
  try {
    await this.allowReconnection(client, RECONNECTION_WINDOW_SECONDS); // 120 mp
    client.send('yourSlot', slot); // onJoin NEM fut le újra — a kliens React state-je elveszett, újra el kell küldeni
    this.broadcast('opponentReconnected', { slot }, { except: client });
  } catch {
    this.broadcast('opponentLeft', { slot }, { except: client });
  }
}
```

Kulcs-felismerés a Colyseus forráskódjának átnézéséből (`node_modules/@colyseus/core/build/Room.mjs`): sikeres újracsatlakozáskor a **`sessionId` és a `Client` objektum-referencia is ugyanaz marad** (csak a belső WebSocket-referenciája cserélődik) — emiatt a `clientSlots`/`gameSessionPlayer` bejegyzések automatikusan érvényben maradnak, nincs szükség semmilyen "slot-visszaállítás" logikára. `onJoin` viszont **nem fut le újra** újracsatlakozáskor — ezért kell a `client.send('yourSlot', slot)` explicit újraküldése, különben a frissen újratöltött oldal sosem tudná meg, melyik oldalon játszik.

A `RECONNECTION_WINDOW_SECONDS = 120` (2 perc) szándékosan nagyvonalú érték — ez egy alkalmi családi app, nem versenyjáték, jobb, ha megvárjuk a döcögő WiFi-t vagy a telefon-lezárást, mint hogy feleslegesen "elveszítsünk" egy játékost.

### 16.2 Kliens-oldali mechanizmus

`src/client/core/transport/reconnectionStorage.ts` (game-agnosztikus, `core/transport/`-ban, nem Dáma-specifikus): a `room.reconnectionToken`-t (ami a colyseus.js SDK-ban már `roomId:token` kombinált formátumban van) `localStorage`-ban tárolja, játék-típusonként kulcsolva.

`DamaOnlineGamePage` csatlakozási logikája bővült egy harmadik ággal a meglévő "létrehozás" / "csatlakozás" mellett: ha a route-ból jövő `roomId`-hoz van mentett token, először `colyseusClient.reconnect(token, OpaqueGameStateSchema)`-t próbál; hiba esetén (lejárt/érvénytelen token) törli a mentett tokent és visszaesik a normál `joinById`-ra. A token mentése kizárólag a `yourSlot` üzenet kézhezvételekor történik (`room.onMessage('yourSlot', ...)`) — ez a pont természetesen csak admitolt játékosoknál fut le (friss csatlakozás VAGY sikeres újracsatlakozás esetén egyaránt), a még döntésre váró csatlakozási kérelmezőknél sosem, tehát nincs szükség külön elágazásra.

A még csatlakozásra váró (nem admitolt) kérelmezőkre ez a mechanizmus nem vonatkozik — ha az ő kapcsolatuk szakad meg, egyszerűen újra el kell küldeniük a kérelmet (a `requestOnly=1` query paraméter az URL-ben megmarad egy egyszerű újratöltésnél is).

Az ellenfél kapcsolat-állapotáról (`opponentDisconnected`/`opponentReconnected`/`opponentLeft` üzenetek) egy kis banner tájékoztat a tábla fölött, amíg a parti folyik.

### 16.3 Ellenőrzés

Élő szerver ellen futtatott új smoke teszttel (`temp/reconnection-smoke-test.ts`, `room.leave(false)`-lal szimulálva a nem-szándékos lecsatlakozást — ez a colyseus.js hivatalos módja a hálózat-megszakadás teszteléséhez, mert a grafikus `LEAVE_ROOM` üzenet elküldése nélkül zárja a kapcsolatot): a host értesül az ellenfél lecsatlakozásáról, az ellenfél új kliens-objektummal (valós oldal-újratöltést szimulálva) ugyanabba a slotba (DARK) tud visszacsatlakozni, a host értesül a visszacsatlakozásról, és egy lépés utána is helyesen működik a parti. Egy hibás/lejárt token esetén a `reconnect()` hívás szabályosan elutasításra kerül, ahogy a kliens-oldali fallback-logika feltételezi.
