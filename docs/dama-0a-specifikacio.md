# Fázis 0a + Fázis 1 — Specifikáció: Local Shell és Dáma PoC

**Státusz:** Tervezési fázis — review-ra vár
**Utolsó frissítés:** 2026-07-22
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md)

## 1. Cél és hatókör

Ez a dokumentum a **Fázis 0a** (helyi alkalmazás-váz) és a **Fázis 1** (Dáma proof-of-concept, hot-seat módban) részletes tervét tartalmazza. A multiplayer réteg (Fázis 0b, Colyseus) **nincs a hatókörben** — de az itt lefektetett architektúrának úgy kell készülnie, hogy a multiplayer réteg utólag, a játéklogika (core engine) módosítása nélkül csatlakozzon rá.

**Hatókörben van:**
- `src/` mappastruktúra kialakítása
- Core engine réteg architektúrája (reducer/state-machine minta) — általános, játék-független infrastruktúra
- Transport absztrakció (a hálózat-függetlenség kulcsa)
- Dáma játék engine specifikációja (state, action-ök, szabályok)
- Közös 2D tábla-renderer (SVG) — később a B) klaszter (Sakk, Malom) is ezt használja
- Alap UI-kit elemek listája
- Tech stack pontos verziói

**Nincs hatókörben (Fázis 0b-re halasztva):** auth, lobby, szerver-oldali Colyseus room, letöltéskezelő SW cache/PWA.

## 2. Architektúra — rétegek

A rendszer négy réteget alkalmaz, szigorú függőségi iránnyal (Dependency Inversion — a `core` réteg semmilyen külső csomagtól nem függ):

```
Shell (App, routing, game loader)
   └─> UI (React komponensek, Renderer-ek, UI-kit)
         └─> Application (GameController, Transport)
               └─> Core (reducer, state, actions — tiszta TypeScript, nulla külső függőség)
```

Lásd: [`docs/diagrams/component-architecture.puml`](./diagrams/component-architecture.puml)

### 2.1 Core réteg (`src/games/<game>/engine/`)

Játékonként külön core engine, de közös interfészt követve. Tartalma:
- `state.ts` — a játék állapotát leíró típusok
- `actions.ts` — a lehetséges action-ök uniótípusa
- `reducer.ts` — `(state, action) → newState` tiszta függvény, minden szabályvalidáció itt történik
- `selectors.ts` — derived-data lekérdezések (pl. `getValidMoves`, `getWinner`), amik nem módosítják az állapotot

**Szabály:** a core réteg nem importál se React-et, se renderelő könyvtárat, se hálózati kódot. Unit tesztelhető önmagában (Vitest).

### 2.2 Application réteg (`src/core/transport/`)

Ez a réteg absztrahálja el, hogy egy action *honnan* érkezik, és az állapot-frissítés *hova* jut el. Ez a kulcsa annak, hogy a helyi és a hálózati mód ugyanazt a core engine-t használja.

```typescript
// src/core/transport/GameTransport.ts
export interface GameTransport<TState, TAction> {
  getState(): TState;
  dispatch(action: TAction): void;
  subscribe(listener: (state: TState) => void): () => void; // visszaadja a leiratkozó függvényt
}
```

**Fázis 0a implementáció:**
```typescript
// src/core/transport/LocalGameTransport.ts
export class LocalGameTransport<TState, TAction> implements GameTransport<TState, TAction> {
  private state: TState;
  private listeners = new Set<(state: TState) => void>();

  constructor(
    private reducer: (state: TState, action: TAction) => TState,
    initialState: TState
  ) {
    this.state = initialState;
  }

  getState(): TState {
    return this.state;
  }

  dispatch(action: TAction): void {
    this.state = this.reducer(this.state, action);
    this.listeners.forEach((listener) => listener(this.state));
  }

  subscribe(listener: (state: TState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
```

**Fázis 0b-ben (nem most készül el, csak jelezve a kompatibilitás miatt):** egy `ColyseusGameTransport` ugyanezt az interfészt implementálja majd — a `dispatch` a szerverre küld üzenetet, a `subscribe` a szerver állapot-broadcastjaira iratkozik fel. A reducer maga a szerveren fut authoritatívan, a kliens csak megjeleníti a visszakapott state-et (opcionális optimista előrejelzéssel).

A React oldalon egy generikus hook köti össze a Transport-ot a komponensfával:
```typescript
// src/core/transport/useGameTransport.ts
function useGameTransport<TState, TAction>(
  transport: GameTransport<TState, TAction>
): [TState, (action: TAction) => void]
```

### 2.3 UI réteg (`src/renderers/`, `src/ui-kit/`, `src/games/<game>/ui/`)

- **Renderer-ek** (`src/renderers/grid-2d/GridBoard2D.tsx`): tisztán prezentációs SVG komponens, ami `board` state-et, `onSquareClick` callback-et és `highlightedSquares` listát kap propként. Nincs benne szabály-ismeret. Közös a B) klaszter (Sakk, Malom, Dáma) játékai között.
- **UI-kit** (`src/ui-kit/`): induló elemek — `Button`, `Menu`, `Modal`, `PlayerBadge`. Bővül a további fázisokban (kártya-komponens az A) klaszterhez stb.)
- **Játék-specifikus UI** (`src/games/dama/ui/DamaGamePage.tsx`): összeköti a `LocalGameTransport`-ot a `GridBoard2D`-vel, kezeli a kattintás → action leképezést (pl. két kattintás = from/to koordináta), lekérdezi a `getValidMoves` selector-t a kiemeléshez.

### 2.4 Shell réteg (`src/shell/`)

Fázis 0a-ban minimális: `App.tsx` (routing), `GameLoader.tsx` (dynamic `import()` alapú, játékonkénti code-splitting belépési pont — ez már most bekerül, hogy a moduláris letöltés elve korán tesztelve legyen, de SW cache nélkül). Lobby/auth Fázis 0b-ben.

### 2.5 Elhatárolási szabály: mi kerülhet a `core`-ba?

Csak az kerülhet `src/core/`-ba, ami **bármely játékkal** működne, ha kicserélnénk a `TState`/`TAction` típusparamétereket — vagyis a modul kódja nem tartalmaz semmilyen konkrét szabályt, stratégiát vagy heurisztikát egyetlen játékról sem. Teszt: *"működne-e ugyanez a kód változtatás nélkül a Hotelre is, ha csak a generikus típusokat cserélem?"* Ha nem, a modul `src/games/<game>/` alá tartozik, még akkor is, ha felszínesen "infrastruktúrának" tűnik (mint a PlayerController esete mutatta — lásd 6. szakasz).

Ez ugyanaz az elv, ami már a reducer/state/actions elhelyezését is vezérelte (2.1 szakasz) — a Fázis 1 review során derült ki, hogy ezt következetesen kell alkalmazni minden új absztrakcióra, nem csak a core engine-re.

## 3. Dáma engine specifikáció

> **Megerősítve (2026-07-22):** klasszikus/nemzetközi dáma szabályok — 8×8 tábla, kötelező ütés, lánc-ütés kötelező folytatása, sima bábu 1 mezőt lép/üt átlósan csak előre, dáma (király) az utolsó sor elérésekor, király repülő mozgással bármennyi üres mezőt léphet/üthet átlósan.

### 3.1 State modell

```typescript
type Player = 'LIGHT' | 'DARK';
type PieceType = 'MAN' | 'KING';

interface Piece {
  player: Player;
  type: PieceType;
}

type Position = { row: number; col: number }; // 0-7, csak a sötét mezők használtak

type Board = (Piece | null)[][]; // 8x8

interface DamaState {
  board: Board;
  currentPlayer: Player;
  status: 'IN_PROGRESS' | 'LIGHT_WON' | 'DARK_WON' | 'DRAW';
  /** Lánc-ütés közben az adott bábu pozíciója — ha be van állítva, csak innen indulhat a következő lépés */
  chainCaptureFrom: Position | null;
}
```

### 3.2 Action-ök

```typescript
type DamaAction = { type: 'MOVE'; from: Position; to: Position };
```

A kijelölés/kiemelés (mely mező van kiválasztva, mely mezőkre lehet lépni) **nem** core-state — ez UI-lokális állapot a `DamaGamePage`-ben, ami a `getValidMoves` selectorral kérdezi le a lehetőségeket. Ez tartja a core engine-t minimálisra (Single Responsibility).

### 3.3 Selectorok

```typescript
function getValidMoves(state: DamaState, from: Position): Position[];
function getWinner(state: DamaState): Player | null;
function getMovablePositions(state: DamaState): Position[]; // hozzáadva 2026-07-22: a 3.5/0. lépéshez (kör eleji kiemelés)
```

`getMovablePositions` a soron lévő játékos ténylegesen léphető bábuinak mezőit adja vissza (a kötelező ütés szabályát is figyelembe véve, mert `getValidMoves`-ra épül) — ez szolgálja ki a 3.5 szakasz 0. lépését.

### 3.4 Reducer — fő szabályok

> **Státusz: implementálva és Vitest-tel lefedve (2026-07-22)** — `src/games/dama/engine/{rules,reducer,selectors,initialState}.ts`, tesztek: `rules.test.ts`, `reducer.test.ts` (19 teszt). Az alábbi lista az implementáció közben pontosított/eldöntött végleges szabályokat írja le; ahol eltér a korábbi tervezetitől, azt jelezve.

1. Ha `chainCaptureFrom` be van állítva, csak onnan induló ütés fogadható el.
2. Ha van kötelező ütési lehetőség a soron lévő játékosnak bárhol a táblán, nem-ütő lépés érvénytelen (kötelező ütés szabálya). **Nincs "maximum ütés" kényszer** — ha több ütési lehetőség közül lehet választani, bármelyik legális, nem kell a leghosszabbat/legtöbbet ütőt választani.
3. Sima bábu: **sima (nem ütő) lépésben** csak átlósan előre léphet 1 mezőt üres célmezőre. **Ütésben viszont mind a 4 átlós irányban üthet** (előre és hátra is), ha a szomszédos mezőn ellenfél-bábu áll és a mögötte lévő mező üres — ez a nemzetközi/klasszikus dáma szabálya, pontosítás a korábbi tervezethez képest (ami tévesen csak előre-ütést írt).
4. Király: tetszőleges számú üres mezőt léphet/üthet az átlón (repülő király); ütésnél 0 vagy több üres mező, pontosan 1 ellenfél-bábu, majd tetszőleges üres mező a mögötte lévő szabad szakaszon — nem ugorhat át két bábun ugyanabban az irányban.
5. Ütés után, ha a mozgatott bábuval további ütés lehetséges ugyanabból a pozícióból, a kör nem vált — `chainCaptureFrom` beállítódik, és a soron lévő játszik tovább.
6. Bábu, ami eléri az ellenfél alapsorát, dámává (`KING`) alakul. **Döntés (implementáció közben, mert a szabály nem volt egyértelműen rögzítve):** ha ez láncütés közben történik, a lépés ott véget ér — a frissen dámává vált bábu **nem** folytatja ugyanabban a körben az ütést, még akkor sem, ha királyként tudna tovább ütni. Más dáma-variánsok ezt másképp kezelik (pl. FMJD nemzetközi szabály szerint bizonyos esetekben kötelező a folytatás) — ha ez fontos, jelezd, és módosítjuk.
7. Győzelem: ha a soron lévő játékosnak nincs egyetlen léphető bábuja sem (se lépés, se ütés) → a másik játékos nyer. Ha egy oldalnak elfogy az összes bábuja, ez automatikusan ide tartozik (nincs bábu → nincs lépés).

**Implementációs eltérés a korábbi tervezethez képest:** a `rules.ts` nem `findCaptureSequences(state, from): Position[][]` (teljes, előre kiszámolt több-ugrásos szekvenciák) formában készült el, hanem **`findCaptureMoves(state, from): CaptureMove[]`** — egy-ugrásos ütési lehetőségeket ad vissza (`{ to, captured }` alakban). A láncütést a reducer valósítja meg úgy, hogy minden egyes `MOVE` action egyetlen ugrást hajt végre, és utána újra lekérdezi, van-e folytatás a landolási mezőről (lásd 3.5 szakasz) — ez egyszerűbb, mint egy teljes rekurzív szekvencia-generátor, és pontosan illeszkedik az action-modellhez.

Ez a logika teljes egészében a `reducer.ts`-ben és a hozzá tartozó `rules.ts` segédfüggvényekben valósul meg (`findSimpleMoves`, `findCaptureMoves`, `hasAnyCapture`, `hasAnyLegalMove`, `isPromotionRow`, `opponentOf`).

Lásd: [`docs/diagrams/dama-class-diagram.puml`](./diagrams/dama-class-diagram.puml) és [`docs/diagrams/dama-state-diagram.puml`](./diagrams/dama-state-diagram.puml) — ezek a diagramok a `findCaptureSequences` nevet használják a `findCaptureMoves` helyett; a nevet a diagramban is érdemes lesz egy következő review körben frissíteni, tartalmilag a leírt állapotgép/folyamat helytálló marad.

### 3.5 Egy lépés folyamata (UI → state)

Lásd: [`docs/diagrams/move-sequence-diagram.puml`](./diagrams/move-sequence-diagram.puml)

0. A kör elején a játék kiemeli azokat a mezőket, amiken léptethető bábu áll.
1. Játékos kattint egy saját bábura → `DamaGamePage` lokális state-je eltárolja mint kijelölt mezőt, lekéri `getValidMoves`-t, a `GridBoard2D` kiemeli az elérhető célmezőket.
2. Játékos kattint egy kiemelt célmezőre → `dispatch({ type: 'MOVE', from, to })` a transporton keresztül.
3. `LocalGameTransport.dispatch` lefuttatja a reducert, frissíti a belső state-et, értesíti a feliratkozókat.
4. `useGameTransport` hook újra-renderel, a `GridBoard2D` az új `board` state-et jeleníti meg.

## 4. Javasolt `src/` mappastruktúra (Fázis 0a + Dáma)

```
src/
  core/                          # KIZÁRÓLAG game-agnosztikus kód — semmilyen games/* nem importálhatja "vissza" ide a saját logikáját
    transport/
      GameTransport.ts
      LocalGameTransport.ts
      useGameTransport.ts
    controller/
      PlayerController.ts        # game-agnosztikus szerződés
      HumanController.ts         # game-agnosztikus (no-op), NEM a konkrét AI
    types.ts                    # generikus Reducer<S, A> típus
  renderers/
    grid-2d/
      GridBoard2D.tsx
      GridBoard2D.module.css
  ui-kit/
    Button.tsx
    Menu.tsx
    Modal.tsx
    PlayerBadge.tsx
  games/
    dama/
      engine/
        state.ts
        actions.ts
        initialState.ts          # createInitialState() — a tervezetben eredetileg state.ts-be volt sorolva, SRP miatt külön fájl lett
        reducer.ts
        rules.ts
        selectors.ts
        testHelpers.ts           # teszt-fixture segédfüggvények (emptyBoard, withPieces, man/king/pos) — nem production kód
        rules.test.ts            # a tervezett egyetlen engine.test.ts helyett rules.test.ts + reducer.test.ts, jobb SRP a tesztekben is
        reducer.test.ts
      ui/
        DamaGamePage.tsx
        DamaGamePage.module.css
      ai/                        # NEM Fázis 1 hatókör — csak a jövőbeli helye van kijelölve
        DamaAIController.ts      # PlayerController<DamaState, DamaAction> — Dáma-specifikus, nem a core-ban
        strategies.ts            # pl. randomLegalMove, később minimax-alapú stratégia
      index.ts                  # a GameLoader ezt importálja dinamikusan
  shell/
    App.tsx
    routes.tsx
    GameLoader.tsx
  main.tsx
```

## 5. Tech stack — pontos verziók (javaslat, telepítéskor ellenőrizendő)

| Eszköz | Verzió (javasolt) | Megjegyzés |
|---|---|---|
| React | 19.x | |
| TypeScript | 5.x | strict mode |
| Vite | 6.x | build/dev-server (**megerősítve 2026-07-22**); natív dynamic import + code-splitting, gyors dev-server, PWA plugin elérhető Fázis 0b-hez |
| Vitest | legfrissebb | a core engine reducer/selector unit tesztjeihez |
| ESLint + typescript-eslint | legfrissebb | SOLID/Clean Code-ot segítő szabályok (pl. `no-unused-vars`, komplexitás-limitek) |
| Prettier | legfrissebb | formázás |

## 6. Player Controller absztrakció (human/AI keverhetőség)

**Döntés (2026-07-22):** a Fázis 1 PoC hot-seat módban indul, AI-ellenfél nélkül — de a platform hosszú távú követelménye, hogy **minden játékban keverhető legyen ember és AI játékos** (pl. 1 ember vs. 1 AI, vagy többjátékos módban vegyesen). Emiatt a vezérlés forrását már Fázis 0a-ban elvonatkoztatjuk, hogy az AI később ne igényeljen újratervezést.

> **Fontos elhatárolás (2026-07-22, javítva a review során):** a `core`-ba **csak a game-agnosztikus szerződés és a triviális no-op implementáció** kerül. Egy konkrét AI-stratégia (pl. hogyan válasszon lépést a Dáma AI-ja) pont annyira játék-specifikus tudás, mint maga a reducer — ennek **a `games/<game>/` alá kell kerülnie**, nem a core-ba. A Dáma AI-jának fogalma sem lehet a Hotel szabályairól, és fordítva; ha mindkettő a core-ban élne, az sértené a rétegek közötti szigorú függőségi irányt (2. szakasz) és összekeverné a játékok kódját.
>
> **Implementáció közben talált, ugyanebből a hibaosztályból való finomítás:** az eredeti vázlat a `player: Player` mezőt használta az interfészben, de a `Player` maga is Dáma-specifikus típus (`'LIGHT' | 'DARK'`, lásd 3.1 szakasz) — ha ez szó szerint bekerül a core interfészbe, az ugyanaz a fajta szivárgás, mint a konkrét AI-osztály esete. A megvalósításban ezért `TPlayerId` generikus típusparaméter került be helyette, hogy a `PlayerController` interfész és a `HumanController` valóban game-agnosztikus maradjon.

```typescript
// src/core/controller/PlayerController.ts — game-agnosztikus szerződés
export interface PlayerController<TState, TAction, TPlayerId = unknown> {
  readonly playerId: TPlayerId;
  /** Meghívódik minden state-változáskor; ha a controller AI és rajta a sor, itt számolja ki és dispatch-eli a lépését */
  onStateChange(state: TState, dispatch: (action: TAction) => void): void;
}
```

```typescript
// src/core/controller/HumanController.ts — valóban game-agnosztikus, mert no-op:
// bármilyen TState/TAction/TPlayerId mellett működik, sosem nyúl a state-hez.
export class HumanController<TState, TAction, TPlayerId = unknown>
  implements PlayerController<TState, TAction, TPlayerId>
{
  constructor(readonly playerId: TPlayerId) {}
  onStateChange(): void {
    /* szándékosan üres — a lépés a UI kattintás-láncból (2.3-as szakasz) érkezik */
  }
}
```

```typescript
// src/games/dama/ai/DamaAIController.ts — JÁTÉK-SPECIFIKUS, nem a core-ban él
// TPlayerId itt konkrétan Dáma Player-ré ('LIGHT' | 'DARK') specializálódik.
export class DamaAIController implements PlayerController<DamaState, DamaAction, Player> {
  constructor(readonly playerId: Player, private strategy: DamaAIStrategy) {}

  onStateChange(state: DamaState, dispatch: (action: DamaAction) => void): void {
    if (state.currentPlayer !== this.playerId || state.status !== 'IN_PROGRESS') return;
    const move = this.strategy(state); // pl. kezdetben random legális lépés, később minimax
    dispatch({ type: 'MOVE', from: move.from, to: move.to });
  }
}
```

**Fázis 1-ben egyik AI-implementáció sem készül el** — csak a `PlayerController` interfész és a `HumanController` kerül be a core-ba, illesztési pontként. A `DamaAIController` (és bármely más játék AI-ja) egy **későbbi fázis** hatóköre, amikor a klaszter B) AI-ellenfél igénye (lásd `Projekt-conception.md` klaszter-táblázat: "közös AI-ellenfél (minimax) lehetőség") napirendre kerül.

**Megosztható építőelem (opcionális, később mérlegelendő):** ha több klaszter B) játék (Sakk, Malom, Dáma) is minimax-alapú AI-t használ, egy **game-agnosztikus, tisztán algoritmikus** minimax-motor (`src/core/ai/minimax.ts`) hasznos lehet — ez viszont csak az algoritmust tartalmazná (fa-bejárás, alfa-béta vágás), a konkrét `getLegalMoves`/`applyMove`/`evaluate` függvényeket paraméterként kapná a hívó játéktól. Ez a modul így is game-agnosztikus maradna (nem tudja, hogy dámáról van szó), csak a `DamaAIController` "kötné be" a Dáma-specifikus logikával. **Ez nem Fázis 1 hatókör**, csak elvi lehetőség jegyzésre.

A `DamaGamePage` (vagy egy generikus `GameSessionRunner`) minden playerhez egy `PlayerController`-t rendel a munkamenet indításakor (`HumanController` mindkettőhöz Fázis 1-ben), és minden `subscribe` callback-nél végigfuttatja a controllereken az `onStateChange`-et. Ez a réteg a Transport és a UI között helyezkedik el, és — akárcsak a Transport — nem befolyásolja a core reducer-t.

> **Implementációs eltérés (2026-07-22):** a ténylegesen elkészült `DamaGamePage` **nem** példányosít `HumanController`-t — hot-seat módban a UI kattintás közvetlenül dispatch-el a transporton, a `HumanController` egy no-op réteg beiktatása csak felesleges indirekciót adott volna hozzá (YAGNI). A `PlayerController`/`HumanController` a `core/`-ban készen áll, és a bekötés pontosan akkor válik szükségessé, amikor egy `AIController` is megjelenik ugyanabban a munkamenetben — addig nincs éles felhasználója, csak illesztési pont.

## 7. Fázis 1 státusz és nyitott pontok

**Implementálva és tesztelve (2026-07-22):** a teljes Dáma engine (`rules.ts`, `reducer.ts`, `selectors.ts`, `initialState.ts`) és a hot-seat `DamaGamePage` UI. 19 Vitest teszt zöld, `tsc --noEmit`, `eslint .` és `vite build` is hibamentes. Élő böngészős kattintgatásos tesztelés **nem történt** ebben a körben — ha ezt szeretnéd, jelezd, és végigmegyünk rajta a dev szerverrel.

A review során a kód gyakorlatilag felülírta/pontosította a spec néhány részletét (lásd a 3.4 és a fenti implementációs eltérés jegyzet) — ezek nem blokkoló nyitott kérdések, hanem tudatosan dokumentált döntések, de érdemes átnézni és jelezni, ha valamelyik nem a szándékod szerint való:

- [ ] A MAN mind a 4 irányban üthet (nem csak előre) — nemzetközi dáma szabály, eltér az eredeti tervezet szövegétől (3.4/3. pont).
- [ ] Promóció megszakítja a láncütést, még akkor is, ha a frissen dámává vált bábu tudna tovább ütni (3.4/6. pont) — más variánsok másképp kezelik.
- [ ] LIGHT kezd (konvenció, `initialState.ts`) — tetszőleges választás volt, ha DARK-ot preferálod, egysoros csere.
- [ ] Nincs "maximum ütés" kényszer — bármelyik legális ütés választható, nem kell a leghosszabb szekvenciát végigjátszani.
