# Fázis 0c — Specifikáció: AI ellenfél, szoba-jelszó és csatlakozási kérelem a multiplayer szobákban

**Státusz:** Implementálva és élesben (két-kliens smoke teszttel) ellenőrizve — a lenti terv a ténylegesen megvalósított viselkedést írja le
**Utolsó frissítés:** 2026-07-24
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md), [dama-0a-specifikacio.md](./dama-0a-specifikacio.md) (§6, `PlayerController`/`HumanController`/`AIController` koncepció), [dama-0b-multiplayer-specifikacio.md](./dama-0b-multiplayer-specifikacio.md)

> **Fontos, általános megjegyzés:** a szoba-jelszó, láthatóság és csatlakozási kérelem logika a `GameRoom` (core) osztályban él, nem `DamaRoom`-ban — ez a rendszer változtatás nélkül öröklődik minden jövőbeli játék (Hotel, Catan, ...) szoba-osztályába is. Ezért éri meg most alaposan megtervezni: minden más játék lobby-ja pontosan ugyanígy fog működni.

## 1. Cél és hatókör

**Kérés:** szoba létrehozásakor a létrehozó választhassa meg, hogy az ellenfele ember vagy AI legyen. Ha AI-t választ, a játék azonnal induljon. Az AI kizárólag játékos-bemeneteket szimulálva interaktáljon a játékkal. Emellett a létrehozó opcionálisan jelszóval védheti a szobát (megadva vagy generáltatva), vagy publikusan hagyhatja. Jelszavas szobáknál a csatlakozni kívánó — ha nem ismeri a jelszót — kérelmet is küldhet, amit a szoba tulajdonosa (a létrehozó) elfogadhat vagy elutasíthat.

**Hatókörben van:**
- Szoba-létrehozási UI bővítése: ellenfél-típus (Ember / AI) **és** jelszó (nincs / generált / megadott) választás
- Szerver-oldali "virtuális kliens" AI, ami ugyanazon a validációs/reducer-csövön megy át, mint egy emberi lépés
- Egyszerű, teljesen véletlenszerű AI-stratégia (**megerősítve**)
- Számozott szintetikus AI-felhasználók ("AI ellenfél 1", "AI ellenfél 2", ...) a `GameSessionPlayer` rekordokhoz
- **Szoba-jelszó**: megadható vagy generálható, kikapcsolható (publikus szoba)
- **Jelszavas szobák is megjelennek a lobby-listában**, lakat ikonnal jelölve
- **Csatlakozási kérelem** — kizárólag jelszavas szobáknál elérhető alternatív belépési út jelszó nélkül, amit a szoba létrehozója fogad el/utasít el, valós időben, időkorlát nélkül
- Szoba láthatósága/kapacitása: ha betelt (ember + AI együtt számolva), rejtsük el a lobby-listából — ez továbbra is a **kizárólagos** ok, ami miatt egy szoba eltűnik a listáról

**Nincs hatókörben (külön, jövőbeli téma):**
- Erősebb AI (minimax stb.)
- Hot-seat módú, helyi (nem hálózati) AI ellenfél (lásd Fázis 0a §6 — más koncepció, ott marad)
- "AI gondolkodik…" mesterséges késleltetés — **megerősítve, hogy nem kell**
- Csatlakozási kérelem publikus szobáknál — nincs értelme, oda bárki egyből csatlakozhat
- Már elindult (3+ fős) játékhoz való utólagos csatlakozás/kérelmezés — ez a mechanizmus csak a "várakozás az ellenfélre" fázisban él

## 2. A legfontosabb döntés: hol és hogyan fut az AI?

**Megerősítve: A) opció — szerver-oldali "virtuális kliens".** Az AI-nak nincs valódi WebSocket-kapcsolata — a `GameRoom` maga, minden állapotváltozás után, megnézi: "a soron lévő player-slot egy AI-slot-e?" Ha igen, egy stratégia-függvénnyel kiszámol egy lépést, és **ugyanazon a kódúton engedi át**, mint egy `onMessage('action', ...)`-ban érkező emberi lépést (`isValidAction` → `isPlayersTurn` → `reducer` → `syncState`). Nincs kiváltságos state-hozzáférés.

## 3. Szoba-jelszó, láthatóság és csatlakozási kérelem

### 3.1 Három, egymásra épülő mechanizmus — nem három egyenrangú "mód"

**a) Lobby-láthatóság — kizárólag kapacitás alapján.** A `GameRoom` számolja a `joinCount`-ot (ember + AI együtt). Amint `joinCount >= maxClients`, a room `this.setPrivate(true)`-t hív, és eltűnik a lobby-listából. **A jelszó megléte önmagában többé NEM rejti el a szobát** — ez a round-2 tervhez képesti változás, a mostani visszajelzésed alapján ("szeretném, ha a privát szobák is megjelennének a listában").

**b) Szoba-jelszó — opcionális, de a jelszavas szoba is látszik a listában.** A `GameRoom`-on egy `roomPassword: string | null` mező (memóriában, nincs DB-tábla). Ha be van állítva, a szoba metaadatában (`this.setMetadata({ hasPassword: true })`) jelezzük ezt, hogy a kliens lakat ikont rajzolhasson a szoba neve mellé a lobby-listában — **maga a jelszó soha nem kerül a metaadatba/listába**, csak a "kell-e jelszó" logikai jelző. Csatlakozáshoz a helyes jelszó szükséges (`onAuth`-ban ellenőrizve), VAGY egy elfogadott kérelem (lásd c).

**c) Csatlakozási kérelem — kizárólag jelszavas szobáknál, a jelszó helyettesítője.** A te válaszod alapján ("csak annál a szobánál kelljen, ahol van jelszó beállítva, és a jelszót váltsa ki") ez NEM egy harmadik, önálló belépési mód, hanem egy **alternatív út ugyanahhoz a jelszavas szobához**, azok számára, akik nem ismerik a jelszót: elküldik a szándékukat, a szoba létrehozója (= az első csatlakozó, a "host") valós időben elfogadja vagy elutasítja. Nincs időkorlát — a kérelem addig vár, amíg a host nem reagál, vagy a kérelmező vissza nem vonja (bezárja a böngészőlapot / rákattint "Mégse"-re).

Publikus (jelszó nélküli) szobánál a kérelem funkciónak nincs értelme — ott bárki egyből csatlakozik, ahogy eddig.

### 3.2 Hogyan működik technikailag a kérelem — nincs szükség szobák közti RPC-re

A kulcs-felismerés: a kérelmező ügyfél simán **csatlakozik magához a cél `GameRoom`-hoz** (`client.joinById(roomId, { token, requestOnly: true })`), csak **nem kap játékos-slotot azonnal**. Mivel a WebSocket-kapcsolat már létrejött, a host és a kérelmező között a valós idejű "elfogadom/elutasítom" kommunikáció a már meglévő Colyseus-csatornán megy — nincs szükség a szobák közti RPC-re (`matchMaker.remoteRoomCall`) vagy egy köztes üzenetküldő rendszerre.

- `onAuth`: ha `options.requestOnly === true`, a jelszó-ellenőrzés **kimarad** (ő pont azért kér, mert nincs jelszava) — de a JWT-ellenőrzés továbbra is kötelező.
- `onJoin`: ha `options.requestOnly === true` **és** van beállított jelszó, a kliens **nem** kap slotot — bekerül a `pendingRequests` listába (lásd 3.3 kódváz), és vár.
- A host (aki már bent van, "várakozás az ellenfélre" képernyőn) látja a `state.pendingRequests` frissülését (ez egy szinkronizált schema-mező, tehát valós időben megjelenik nála Elfogad/Elutasít gombokkal).
- A host `room.send('respondToJoinRequest', { sessionId, accept })`-et küld.
- A `GameRoom` a `sessionId` alapján megkeresi a kérelmező `Client` objektumát (`this.clients.getById(sessionId)`), és:
  - **elfogadás esetén** ugyanazt az "engedjük be" logikát futtatja le, mint a normál (jelszóval sikeres) csatlakozás — lásd `admitPlayer` a kódvázban;
  - **elutasítás esetén** `client.send('joinRejected', ...)`-et küld, majd `client.leave()`-vel lezárja a kapcsolatot.
- Ha a kérelmező menet közben lecsatlakozik (bezárja a lapot), az `onLeave`-ben eltávolítjuk a `pendingRequests`-ből, hogy a host ne fogadhasson el egy már nem létező kérelmet.
- Ha időközben betelik a szoba (mert egy másik kérelmezőt vagy a jelszóval csatlakozót közben elfogadták/beengedték), a többi még függőben lévő kérelem automatikusan elutasításra kerül (`joinRejected`, ok: "a szoba megtelt").

**Csak a host dönthet — általános szabály, nem csak Dámára.** A `creatorSessionId`-t (az első csatlakozó session-je) a `GameRoom` eltárolja `onJoin`-ban; a `respondToJoinRequest` üzenetet csak ettől a klienstől fogadjuk el, és a `state.pendingRequests` is kizárólag a host kliensén jelenik meg a UI-ban. **Megerősítve:** ez 3+ fős játékoknál (pl. Catan) is így marad — a már csatlakozott, de nem host játékosok nem látják és nem is kezelhetik a függőben lévő kérelmeket, ez a `GameRoom` core viselkedésének végleges, minden játékra érvényes szabálya.

### 3.3 Frissített `GameRoom` kódváz

```typescript
// src/server/core/GameRoom.ts (kiegészítés a jelenlegi implementációhoz képest)
export abstract class GameRoom<TState, TAction, TPlayerSlot extends string = string> extends Room<
  RoomStateSchema, unknown, unknown, AuthPayload
> {
  // ... meglévő abstract metódusok (reducer, createInitialState, assignPlayerSlot, isPlayersTurn, isValidAction) ...
  protected abstract computeAiMove(state: TState): TAction | null; // ÚJ, lásd 4. szakasz

  private readonly aiSlots = new Set<TPlayerSlot>();
  private aiOpponentRequested = false;
  private roomPassword: string | null = null; // ÚJ
  private creatorSessionId: string | null = null; // ÚJ

  async onAuth(
    _client: Client,
    options: { token?: string; password?: string; requestOnly?: boolean },
  ): Promise<AuthPayload> {
    const auth = verifyToken(options.token);
    const passwordOk = !this.roomPassword || options.password === this.roomPassword || options.requestOnly;
    if (!passwordOk) throw new Error('Hibás szoba-jelszó.');
    return auth;
  }

  async onCreate(options: {
    opponentType?: 'HUMAN' | 'AI';
    password?: string; // hiányzik/üres → nincs jelszó (publikus szoba)
  }): Promise<void> {
    // ... meglévő state/session setup változatlan ...
    this.aiOpponentRequested = options.opponentType === 'AI';

    if (options.password) {
      this.roomPassword = options.password === 'GENERATE' ? generateRoomPassword() : options.password.trim();
      this.setMetadata({ hasPassword: true }); // csak a jelző kerül a lobby-listába, a jelszó soha
    }
    // ... onMessage('action', ...) + flushInterval setup változatlan ...

    this.onMessage('respondToJoinRequest', (client, msg: { sessionId: string; accept: boolean }) => {
      if (client.sessionId !== this.creatorSessionId) return; // csak a host dönthet
      void this.respondToJoinRequest(msg.sessionId, msg.accept);
    });
  }

  async onJoin(client: Client, options: { requestOnly?: boolean }, auth: AuthPayload): Promise<void> {
    if (this.joinCount === 0) this.creatorSessionId = client.sessionId;

    if (options.requestOnly && this.roomPassword) {
      this.state.pendingRequests.push(
        new PendingJoinRequest(client.sessionId, auth.userId, auth.displayName),
      );
      return; // nem kap slotot, csak vár
    }

    await this.admitPlayer(client, auth);
  }

  /** Slot kiosztása + AI regisztráció + kapacitás-ellenőrzés — közös út a jelszavas/publikus és az elfogadott kérelmes belépéshez. */
  private async admitPlayer(client: Client, auth: AuthPayload): Promise<void> {
    const slot = this.assignPlayerSlot(this.joinCount);
    this.joinCount += 1;
    this.clientSlots.set(client.sessionId, slot);
    client.send('yourSlot', slot);

    await prisma.gameSessionPlayer.create({
      data: { gameSessionId: this.dbSessionId, userId: auth.userId, playerSlot: slot },
    });

    if (this.aiOpponentRequested && this.aiSlots.size === 0) {
      await this.registerAiOpponent();
    }

    if (this.joinCount >= this.maxClients) {
      await this.setPrivate(true); // kapacitás betelt — ez az EGYETLEN ok, ami miatt egy szoba eltűnik a listáról
      this.rejectRemainingPendingRequests('A szoba megtelt.');
      this.state.ready = true;
      await prisma.gameSession.update({ where: { id: this.dbSessionId }, data: { status: 'IN_PROGRESS' } });
    }
  }

  private async respondToJoinRequest(sessionId: string, accept: boolean): Promise<void> {
    const index = this.state.pendingRequests.findIndex((r) => r.sessionId === sessionId);
    if (index === -1) return;
    this.state.pendingRequests.deleteAt(index);

    const client = this.clients.getById(sessionId);
    if (!client) return; // időközben lecsatlakozott

    if (accept) {
      await this.admitPlayer(client, client.auth);
    } else {
      client.send('joinRejected', { reason: 'A szoba tulajdonosa elutasította a kérelmet.' });
      void client.leave();
    }
  }

  private rejectRemainingPendingRequests(reason: string): void {
    for (const request of [...this.state.pendingRequests]) {
      const client = this.clients.getById(request.sessionId);
      client?.send('joinRejected', { reason });
      void client?.leave();
    }
    this.state.pendingRequests.clear();
  }

  async onLeave(client: Client): Promise<void> {
    const index = this.state.pendingRequests.findIndex((r) => r.sessionId === client.sessionId);
    if (index !== -1) this.state.pendingRequests.deleteAt(index);
  }

  private async registerAiOpponent(): Promise<void> {
    const aiNumber = this.aiSlots.size + 1;
    const aiUserId = await ensureAiUser(aiNumber);
    const slot = this.assignPlayerSlot(this.joinCount);
    this.joinCount += 1;
    this.aiSlots.add(slot);

    await prisma.gameSessionPlayer.create({
      data: { gameSessionId: this.dbSessionId, userId: aiUserId, playerSlot: slot },
    });
  }

  private applyAction(action: TAction): void {
    this.gameState = this.reducer(this.gameState, action);
    this.syncState();
    this.dirty = true;
  }

  private maybeTriggerAiMove(): void {
    for (let guard = 0; guard < MAX_AI_MOVES_PER_TRIGGER; guard += 1) {
      const actingSlot = [...this.aiSlots].find((slot) => this.isPlayersTurn(this.gameState, slot));
      if (!actingSlot) return;
      const action = this.computeAiMove(this.gameState);
      if (!action) return;
      this.applyAction(action);
    }
  }
}
```

```typescript
// src/server/core/PendingJoinRequestSchema.ts — ÚJ, game-agnosztikus
import { Schema, type } from '@colyseus/schema'; // defineTypes non-decorator formában, lásd meglévő konvenció

export class PendingJoinRequest extends Schema {
  declare sessionId: string;
  declare userId: string;
  declare displayName: string;

  constructor(sessionId: string, userId: string, displayName: string) {
    super();
    this.sessionId = sessionId;
    this.userId = userId;
    this.displayName = displayName;
  }
}
defineTypes(PendingJoinRequest, { sessionId: 'string', userId: 'string', displayName: 'string' });
```

```typescript
// src/shared/core/OpaqueGameStateSchema.ts — KIEGÉSZÍTVE (marad "core", nem game-specifikus)
export class OpaqueGameStateSchema extends Schema {
  declare stateJson: string;
  declare ready: boolean;
  declare pendingRequests: ArraySchema<PendingJoinRequest>; // ÚJ
}
defineTypes(OpaqueGameStateSchema, {
  stateJson: 'string',
  ready: 'boolean',
  pendingRequests: [PendingJoinRequest], // ÚJ
});
```

```typescript
// src/server/core/generateRoomPassword.ts — ÚJ, game-agnosztikus, formátuma megerősítve
export function generateRoomPassword(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase(); // pl. "K3F9QX" — 6 karakter
}
```

**Miért működik ez a létrehozó saját `onAuth`-jánál is probléma nélkül?** A létrehozó a szoba `onCreate`-jét saját maga váltja ki (`client.create(...)`), és utána Colyseus automatikusan lefuttatja rá is az `onAuth`/`onJoin`-t — mivel ő nem küld `password`-öt (ő állítja be, nem ismeri kívülről), és nem `requestOnly`, ezért nála a `passwordOk` kifejezés `!this.roomPassword`-ön bukna el, ha a jelszó már be lenne állítva `onCreate`-ben `onAuth` lefutása előtt. Ezt a sorrendi függést a végleges implementációban ellenőrizni kell (Colyseus `onCreate` teljesen lefut, mielőtt a létrehozó saját `onAuth`/`onJoin`-ja elindulna) — ha mégsem, a létrehozót külön, jelszó-ellenőrzés nélkül kell beengedni (`client.sessionId` az első hívás).

**Miért kell a `guard`/ciklus a `maybeTriggerAiMove`-ban?** Láncütésnél (Fázis 0a spec §3.4) a `currentPlayer` NEM vált a lépések között, amíg a bábu tovább üthet. A `guard` egy defenzív felső korlát.

## 4. Adatmodell: számozott szintetikus AI-felhasználók

*(Változatlan az előző kör óta.)* A `GameSessionPlayer.userId` kötelező FK a `users` táblára — egy AI-nak is kell egy `User` sor, számozva (1. visszajelzési pont).

```typescript
// src/server/core/aiUsers.ts — ÚJ, game-agnosztikus
import { prisma } from '../db/prismaClient';

/** Lusta upsert — nincs előre-seedelés, az első használatkor jön létre. */
export async function ensureAiUser(aiNumber: number): Promise<string> {
  const id = `ai-opponent-${aiNumber}`;
  await prisma.user.upsert({
    where: { id },
    update: {},
    create: { id, displayName: `AI ellenfél ${aiNumber}`, inviteCode: 'FAMILY2026' },
  });
  return id;
}
```

Az `inviteCode: 'FAMILY2026'` csak a séma NOT NULL megkötését elégíti ki — ennek most **semmi köze** a szoba-jelszóhoz (azok teljesen külön mechanizmusok, lásd 3. szakasz). **Nincs séma-változás, nincs seed.ts-módosítás.**

## 5. Kliens-oldali változások

### 5.1 Szoba-létrehozási UI: ellenfél + jelszó választás

```
┌───────────────────────────────────┐
│  Új szoba                         │
│                                    │
│  Ellenfél:                        │
│  ⦿ Ember      ⦾ AI                │
│                                    │
│  Jelszó:                          │
│  ⦿ Nincs (publikus szoba)         │
│  ⦾ Legyen jelszó                  │
│      ⦿ Generálja a rendszer       │
│      ⦾ Megadom:  [__________]     │
│                                    │
│           [Mégse]     [Létrehozás]│
└───────────────────────────────────┘
```

Megerősítéskor:
```typescript
const params = new URLSearchParams({ opponent: opponentType });
if (passwordMode === 'generate') params.set('password', 'GENERATE');
if (passwordMode === 'custom') params.set('password', customPassword);
navigate(`/games/${gameId}/online/${NEW_ROOM_PARAM}?${params}`);
```

### 5.2 Lobby-lista: lakat ikon jelszavas szobáknál

A `LobbyRoom` beépített 'rooms'/'+'/'-' üzenetei tartalmazzák a szoba `metadata`-ját (lásd `docs/dama-0b-multiplayer-specifikacio.md` §6.3) — ebben most megjelenik a `hasPassword: boolean` mező. A `LobbyPage` a szoba neve mellé 🔒 ikont rajzol, ha `room.metadata?.hasPassword`. **Fontos: a jelszó megléte többé nem rejti el a szobát** — csak a betelt kapacitás teszi ezt (lásd 3.1/a).

Egy lakattal jelölt szobára kattintva egy kis inline párbeszédablak jelenik meg, jelszó-mező **és** két gomb:
```
┌─────────────────────────────────────────┐
│  🔒 "Balázs szobája"                     │
│  Jelszó: [______________]                │
│                                           │
│  [Csatlakozás jelszóval]  [Kérés küldése]│
└─────────────────────────────────────────┘
```

### 5.3 `DamaOnlineGamePage`: az opciók átadása a `create()`/`joinById()`-nak

```typescript
// Létrehozáskor
const password = searchParams.get('password'); // 'GENERATE' | egyéni string | null
colyseusClient.create('dama', { token: auth.token, opponentType, password }, OpaqueGameStateSchema);

// Csatlakozáskor — jelszóval
colyseusClient.joinById(roomId, { token: auth.token, password: enteredPassword }, OpaqueGameStateSchema);

// Csatlakozáskor — kérelemmel (nincs jelszava a kérelmezőnek)
colyseusClient.joinById(roomId, { token: auth.token, requestOnly: true }, OpaqueGameStateSchema);
```

A várakozó képernyő a generált/megadott jelszót is megjeleníti (a `client.send('roomPassword', ...)` üzenetből — ezt a hostnak `onJoin`-kor küldi a szerver, ha van jelszó):
```
Várakozás az ellenfélre… Szoba azonosítója: AeGCNR02v
Jelszó: K3F9QX
```

**Host oldali új rész — függőben lévő kérelmek listája**, a `state.pendingRequests` szinkronizált mezőből olvasva, minden várakozási képernyőn megjelenik, ha van benne elem:
```
Csatlakozási kérelmek:
┌───────────────────────────────────────┐
│  Anna szeretne csatlakozni             │
│                    [Elfogad] [Elutasít]│
└───────────────────────────────────────┘
```
Gombnyomásra: `room.send('respondToJoinRequest', { sessionId, accept })`.

**Kérelmező oldali új képernyő**, amíg a host nem válaszol:
```
Kérelem elküldve, várakozás a szoba tulajdonosának jóváhagyására…
                                              [Mégse]
```
Ha jóváhagyva → a szokásos `yourSlot` üzenet érkezik, átvált a táblára. Ha elutasítva → a `joinRejected` üzenet szövegét megjelenítve visszairányít a lobby-listára. "Mégse" gomb → egyszerűen lecsatlakozik (`room.leave()`), amit a szerver `onLeave`-je a `pendingRequests` listából eltávolít.

## 6. `DamaRoom` — a konkrét AI-stratégia

*(Változatlan.)* Teljesen véletlenszerű legális lépés (`pickRandomMove`, `src/server/games/dama/ai/randomMoveStrategy.ts`), mert a stratégia már eleve cserélhetőre lett tervezve (`computeAiMove` abstract metódus).

## 7. Folyamat végig

Lásd: [`docs/diagrams/dama-ai-opponent-sequence.puml`](./diagrams/dama-ai-opponent-sequence.puml) (frissítve: jelszavas szoba a listában lakattal, csatlakozási kérelem folyamata).

## 8. Mappastruktúra-változások

```
src/
  server/
    core/
      GameRoom.ts                    # MÓDOSULT — aiSlots, roomPassword, creatorSessionId,
                                      # onAuth requestOnly-ág, admitPlayer/respondToJoinRequest/
                                      # rejectRemainingPendingRequests/onLeave, registerAiOpponent,
                                      # maybeTriggerAiMove, computeAiMove abstract
      aiUsers.ts                     # ÚJ — ensureAiUser(aiNumber), game-agnosztikus
    games/
      dama/
        DamaRoom.ts                  # MÓDOSULT — computeAiMove hozzáadva
        ai/
          randomMoveStrategy.ts      # ÚJ — Dáma-specifikus AI stratégia (+ .test.ts)

shared/
  core/
    OpaqueGameStateSchema.ts         # MÓDOSULT — pendingRequests: ArraySchema<PendingJoinRequest> mező
    PendingJoinRequestSchema.ts      # ÚJ — lásd §10.1, miért shared/ és nem server/core
    RoomMetadata.ts                  # ÚJ — a lobby-lista `hasPassword` mezőjének megosztott típusa
    generateRoomPassword.ts          # ÚJ — lásd §10.1, miért shared/ és a KLIENS hívja, nem a szerver

prisma/
  schema.prisma                     # NINCS séma-változás
```

Kliens oldalon:
```
src/client/shell/lobby/LobbyPage.tsx            # MÓDOSUL — ellenfél+jelszó Modal, lakat ikon a
                                                 # listában, jelszó/kérés inline párbeszédablak
src/client/games/dama/ui/DamaOnlineGamePage.tsx # MÓDOSUL — opponentType/password query paraméterek,
                                                 # roomPassword üzenet megjelenítése, host oldali
                                                 # pendingRequests lista Elfogad/Elutasít gombokkal,
                                                 # kérelmező oldali "várakozás jóváhagyásra" képernyő
```

## 9. Nyitott pontok

- [x] A) architektúra (szerver-oldali virtuális kliens) — **megerősítve**.
- [x] Teljesen véletlenszerű AI-stratégia v1-re — **megerősítve**.
- [x] "AI gondolkodik…" késleltetés — **megerősítve, hogy nem kell**.
- [x] Számozott AI-felhasználók (1-től) — **beépítve**.
- [x] Szoba-jelszó: megadható vagy generálható, kikapcsolható (publikus mód) — **beépítve**.
- [x] "Szoba létrehozását is jelszóval védeném" a meglévő belépő-kódra vonatkozik — **megerősítve, nincs változás**.
- [x] Generált jelszó formátuma (6 karakteres, nagybetűs alfanumerikus) — **megerősítve**.
- [x] Jelszavas szobák is megjelenjenek a lobby-listában, lakat ikonnal — **megerősítve, beépítve**.
- [x] Csatlakozási kérelem, amit a host fogadhat el/utasíthat el — **megerősítve, csak jelszavas szobáknál, a jelszó helyettesítőjeként (nem önálló mód)**.
- [x] Kérelem időkorlátja — **megerősítve, hogy nincs**.
- [x] A host lecsatlakozik, mielőtt a függőben lévő kérelmekre reagálna — **megerősítve, hogy a szokásos Colyseus `autoDispose` viselkedés elég**, nincs szükség külön kezelésre.
- [x] 3+ fős játékoknál (pl. Catan) a már csatlakozott, de nem host játékosok lássák-e a függőben lévő kérelmeket is — **megerősítve: nem**, kizárólag a host láthatja/kezelheti őket. Ez most már nem csak Dámára, hanem a `GameRoom` core osztály általános szabályaként rögzítve — minden jövőbeli játékra érvényes lesz, nem kell majd újratárgyalni.

**Minden nyitott pont lezárva — a terv implementálva.**

## 10. Implementáció

Elkészült: `GameRoom`, `DamaRoom`, `aiUsers.ts`, `randomMoveStrategy.ts` (+ teszt), a shared séma-fájlok, valamint a `LobbyPage`/`DamaOnlineGamePage` kliens-oldali UI. Ellenőrizve: `tsc --noEmit` (kliens + szerver), ESLint, a meglévő Vitest-csomag (24 teszt), `vite build` (a code-splitting nem sérült — `DamaOnlineGamePage` továbbra is külön chunk), és két élő, valós Colyseus-szerver elleni smoke teszt (`temp/two-client-smoke-test.mjs` — regresszió; `temp/ai-password-request-smoke-test.ts` — AI-szoba azonnali indulása + AI automatikus visszalépése, hibás jelszó elutasítása, kérelem küldése/elfogadása/elutasítása).

### 10.1 Eltérések a tervtől, amik implementáció közben derültek ki

- **A jelszó generálása a KLIENSEN történik, nem a szerveren.** A terv vázlata (§3.3, korábbi verzió) a szerveren generáltatta volna a jelszót egy `'GENERATE'` sentinel-lel — ez viszont vagy egy biztonsági rést nyitott volna (`'GENERATE'` mint univerzális bypass-jelszó), vagy törékeny időzítési feltevést igényelt volna a létrehozó saját `onAuth`-jánál. Egyszerűbb és biztonságosabb megoldás: a `generateRoomPassword()` (`src/shared/core/generateRoomPassword.ts`) a `LobbyPage` "Új szoba" modaljában fut le, a létrehozó AZONNAL látja a jelszót (még a szoba létrejötte előtt), és ez a konkrét string megy a szerverre `options.password`-ként — a szerver `onCreate`-je csak eltárolja, sosem generál. A felhasználó számára ez ugyanaz a viselkedés, csak a megvalósítás egyszerűbb.
- **`PendingJoinRequest` a `src/shared/core/`-ban van, nem `src/server/core/`-ban** (ahogy a korábbi tervvázlat mutatta) — ugyanaz az ok, mint `OpaqueGameStateSchema`-nál: a kliensnek szó szerint ugyanarra az osztályra van szüksége a megbízható `rootSchema` dekódoláshoz.
- **`ArraySchema.deleteAt` nem létezik** a telepített `@colyseus/schema@3` verzióban (a csomag típusdefiníciói között volt egy `deleteAt`-ot listázó, de ebben a verzióban ténylegesen nem használt fájl is — óvatosság: mindig a `node_modules`-ban ténylegesen felbontott `.d.ts`-t kell ellenőrizni, nem a csomag bármelyik `.d.ts` fájlját). A törlés helyette `splice(index, 1)`-gyel történik.
- **Az `OpaqueGameStateSchema`-t importáló régi smoke teszt** (`temp/two-client-smoke-test.mjs`) saját, duplikált séma-osztályt tartalmazott, ami a `pendingRequests` mező hozzáadása után "definition mismatch" figyelmeztetést dobott — javítva: mostantól a valós megosztott sémát importálja, ahogy a kliens is.
