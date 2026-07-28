# Ramses-0c — Specifikáció: AI ellenfél (hot-seat ÉS multiplayer, egyben tervezve)

Állapot: **IMPLEMENTÁLVA és élesben ellenőrizve (2026-07-27).** Lásd a 10. szakaszt a részletekért.

## 1. Cél és hatókör

**Sorrend tudatosan felcserélve a Hotel-mintához képest, a felhasználó kifejezett kérésére**: Hotelnél a 0c fázis az assetekről szólt, az AI a 0d volt (és a hot-seat AI csak utólag, a 0d lezárása után, külön kérésre került be, újrafelhasználva a már kész szerver-oldali logikát). Ramses-nél fordítva: **a 0c fázis maga az AI ellenfél**, mégpedig **kezdettől fogva EGYBEN tervezve hot-seat és multiplayer módra** — nem két külön lépésben (terv szerint, majd "utólag kiderül, hogy újrahasználható").

**Hatókörben:** AI ellenfél mindkét módban (hot-seat: `RamsesSetupPage` játékos-soronkénti AI-kapcsoló, mint Hotelnél; multiplayer: szoba létrehozásakor AI-ellenfelek száma + nehézség, mint Hotelnél), a döntéshozó logika egyetlen, megosztott `shared/games/ramses/ai/` modulban. **Kiegészítve a felhasználó kérésére (2026-07-27): a hot-seat mód rendereléséhez tartozó state is eleve maszkolt legyen, nem csak az AI bemenete** — ez egy valódi, eddig nyitva hagyott rés zárása (lásd 3.2), technikailag túlmutat a szűken vett "AI ellenfél" témán, de mivel pont az AI-tervezés hozta felszínre, ide, a 0c-be kerül.

**Nincs hatókörben:** a nehézségi szintek pontos hangolása (playtesztelés útján — ugyanúgy nem Claude feladata, mint Hotel-0d-nél, lásd `docs/hotel-0d-ai-specifikacio.md` §1), a naplózó rendszeren keresztüli csak-AI elemzés (Hotel-0d.2 mintájára, ha egyáltalán releváns lesz).

## 2. A kihívás, ami Ramses AI-ját alapvetően mássá teszi, mint Dámáét vagy Hotelét

Dáma AI-ja (`pickRandomMove`) és Hotel AI-ja (expectimax + heurisztika) mindkettő **tiszta, állapot nélküli függvény**: `computeMove(state) → action`, mindig csak a JELENLEGI `state`-ből dolgozik, semmit nem kell megjegyezniük a korábbi lépésekről — mert egyik játékban sincs olyan infó, ami egyszer látható, aztán újra elrejtődik.

**Ramses pontosan ez.** A csúsztatási mechanika miatt (lásd `docs/ramses-0a-specifikacio.md` §2.2-2.3) a táblán **mindig pontosan EGY mező van felfedve** (`state.emptyCellId`) — amint egy játékos (ember vagy AI) csúsztat, az előző üres hely új piramist kap (VISSZA-fedődik), a csúsztatott piramis régi helye pedig felfedődik. Egy korábban látott kincs tartalma tehát **nem marad tartósan látható** a `state`-ben — pontosan úgy, ahogy egy valódi memóriajátékban egy human játékosnak fejben kell megjegyeznie, mit látott korábban egy adott mezőn.

**Ebből következik: egy értelmes Ramses-AI NEM lehet állapot nélküli.** Szüksége van egy saját, a játék teljes időtartama alatt megmaradó **memóriára** ("mely mezőn milyen kincset láttam korábban"), amit a JÁTÉK MINDEN eseményéből épít fel (nemcsak a saját lépéseiből — hiszen egy figyelmes ember is megjegyezné, amit egy MÁSIK játékos csúsztatása fed fel). Ez egy valódi, ebben a projektben eddig nem felmerült architekturális igény.

## 3. A memória-mechanizmus tervezete

### 3.1 Egyetlen, megosztott memória — nem játékosonkénti

Mivel minden játékos (ember és AI egyaránt) ugyanazt a közös táblát nézi, és mindenki pontosan ugyanazt az infót láthatja bármely pillanatban, **a memória nem AI-szlotonkénti, hanem játék-globális, egyetlen példány** — akárhány AI-ellenfél van a szobában, mindegyik ugyanazt a memóriát olvassa/bővíti. Ez jelentősen egyszerűsíti a tervet Hotel `computeAiMove(state, slot)` per-szlot logikájához képest.

```ts
// shared/games/ramses/ai/memory.ts
export type RevealMemory = Map<string, string | null>; // cellId -> utoljára ott látott treasureId (null = üres)

export function createRevealMemory(): RevealMemory { ... }

/** Minden állapotváltozás után hívva (ember VAGY AI lépése után egyaránt) — feljegyzi, mi látszik éppen az üres mezőn. */
export function observeRevealedState(memory: RevealMemory, state: RamsesState): void { ... }
```

### 3.2 KRITIKUS tisztességi szabály — SENKI (sem az AI, sem egy ember) nem kaphat valódi, még le nem fedett kincs-infót

Ez a Ramses-0b-ben megoldott maszkolási probléma (`toPublicRamsesState`) **pontos tükörképe, csak most nem (kizárólag) a hálózat, hanem az AI ÉS minden ember-játékos "tisztességessége" a tét**: a szerver-oldali `computeAiMove(state, slot)`-ot a `GameRoom` alaposztály a VALÓDI, teljes `this.gameState`-tel hívja meg (lásd `GameRoom.tryApplyOneAiMove`) — ha az AI döntéshozó logikája ebből közvetlenül olvasná ki egy még lefedett cella `treasureId`-ját, az AI **csalna**, pont az ellenkezője annak az elvnek, amit Dáma-0c/Hotel-0d már kimondott: *"az AI kizárólag szimulált játékos-inputon keresztül hat, nincs privilegizált state-hozzáférése"*.

**Kiterjesztés, a felhasználó kérése alapján, 2026-07-27: ez az elv NEM csak az AI-ra vonatkozik — minden játékos, aki state-et kap, eleve csak a szűrt (maszkolt) verziót lássa, kivétel nélkül.** Online módban ez már a 0b óta adott (a `RamsesStateSchema`/`applyRamsesStateToSchema` a hálózaton csak maszkoltat küld, emberi és AI kliens felé egyaránt) — **de a HOT-SEAT módban idáig SEMMI nem maszkolt semmit**: `LocalGameTransport` a reducer által visszaadott NYERS, teljes `RamsesState`-et adja tovább `RamsesGamePage`-nek, ami a JS-heapben, technikailag React DevTools-szal megnézhetően, a teljes kincs-elrendezést tartalmazza a parti kezdetétől — ez idáig soha nem volt probléma, mert semmilyen kód nem "olvasott vissza" ebből tisztességtelenül, de az AI most pont egy ilyen kód lenne, ha a bemenete a nyers state maradna.

**A megoldás: NEM egy AI-specifikus getter, hanem egy `RamsesGamePage`-be beépített, ÁLTALÁNOS transport-csomagoló, ami MINDEN fogyasztó (a renderelés ÉS az AI-hook egyaránt) felé kizárólag a maszkolt state-et adja ki** — így a komponens szintjén SOSEM létezik egy `state` nevű változó, ami a valódi, titkos adatot tartalmazná; strukturálisan lehetetlen bárhonnan (rendereléshez, AI-döntéshez, egy jövőbeli új funkcióhoz) véletlenül a nyers state-hez nyúlni.

```ts
// src/client/games/ramses/ui/MaskedRamsesTransport.ts
import type { GameTransport } from '../../../core/transport/GameTransport';
import { toPublicRamsesState } from '../../../../shared/games/ramses/engine/rules';
import type { RamsesAction } from '../../../../shared/games/ramses/engine/actions';
import type { RamsesState } from '../../../../shared/games/ramses/engine/state';

/**
 * Wraps ANY RamsesState transport (local or networked) so getState()/subscribe()
 * ALWAYS return the masked, publicly-visible state — dispatch passes straight
 * through (the underlying reducer still needs the true state to resolve
 * outcomes; only what's HANDED OUT is masked). Used unconditionally by
 * RamsesGamePage, so no consumer (rendering OR the AI hook) ever holds a
 * reference to the true state — see docs/ramses-0c-ai-specifikacio.md §3.2.
 * Harmless/idempotent when wrapping an already-masked online transport
 * (ColyseusGameTransport's decode already masks) — re-masking a masked
 * state is a no-op, just consistency by construction instead of "online
 * happens to already handle this elsewhere."
 */
export class MaskedRamsesTransport implements GameTransport<RamsesState, RamsesAction> {
  constructor(private readonly inner: GameTransport<RamsesState, RamsesAction>) {}

  getState(): RamsesState {
    return toPublicRamsesState(this.inner.getState());
  }

  dispatch(action: RamsesAction): void {
    this.inner.dispatch(action);
  }

  subscribe(listener: (state: RamsesState) => void): () => void {
    return this.inner.subscribe((state) => listener(toPublicRamsesState(state)));
  }
}
```

`RamsesGamePage` wrapja ezzel a kapott (`providedTransport ?? localTransport`) transportot, MÉG MIELŐTT `useGameTransport`-nak átadná — a komponens és minden gyermeke (beleértve a `useRamsesHotSeatAi` hookot is, amit ugyanezzel a wrapelt transporttal hívunk) innentől kizárólag a maszkolt nézetet látja. **Ezzel a korábban tervezett, AI-specifikus `getPublicState(transport)` segéd feleslegessé válik a hot-seat oldalon** — a hook egyszerűen `transport.getState()`-et hív, ami by construction már maszkolt.

**Szerver oldalon (`RamsesRoom`) marad a korábban tervezett `getPublicGameState()` getter** — ott nincs `GameTransport` absztrakció (a Room közvetlenül `this.gameState`-et kezeli), tehát a transport-csomagolás mintája nem alkalmazható 1:1, de ugyanaz az elv (egyetlen, névvel ellátott hely a maszkolásra) érvényesül egy metódus formájában.

**Ez továbbra is a 0b munka újrahasznosítása** — a `toPublicRamsesState` pontosan az a primitív, amit mind a szerver-oldali getter, mind a kliens-oldali transport-csomagoló belsőleg hív.

### 3.3 A döntéshozó — három nehézségi szint, ugyanazon a memórián

```ts
// shared/games/ramses/ai/strategy.ts
export type RamsesAiDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export function chooseRamsesAiAction(
  state: RamsesState,       // MÁR a nyilvánosan látható (maszkolt) állapot — a hívó felelőssége (lásd 3.2's gettereit), a függvény nem maszkol
  memory: RevealMemory,
  slot: PlayerId,
  difficulty: RamsesAiDifficulty,
): RamsesAction | null
```

Javasolt (nem véglegesített, playteszteléssel finomítható) viselkedés csúsztatható cellák közötti választáskor:

| Szint | Stratégia |
|---|---|
| **EASY** | Túlnyomórészt véletlen választás — de egy szűk, korlátozott "mit láttam épp az imént" felismerés is van rajta (lásd 3.3.2, 2026-07-27-i kiegészítés): ha egy csúsztatható cella a legutóbb megfigyeltek között van ÉS épp a cél-kincset rejti, odacsúsztat. Sosem kerüli az ismert rossz cellákat. |
| **MEDIUM** | Kerüli azokat a cellákat, amikről TUDJA (emlékszik rá), hogy ROSSZ kincset rejtenek (garantáltan véget vetne a körnek) — ha van más opció; egyébként véletlen. Nem keresi aktívan a győzelmet vagy az ismert üres cellákat. |
| **HARD** | Teljes mohó stratégia: (1) ha ismer olyan csúsztatható cellát, ami a JELENLEGI cél-kincset rejti → oda csúsztat (biztos találat); (2) különben, ha ismer üres (biztonságos) cellát → oda; (3) különben egy sosem-látott (ismeretlen) cellát választ véletlenül; (4) csak akkor csúsztat ismert ROSSZ cellára, ha nincs más választása. |

Mindhárom szint ugyanazt a memóriát olvassa/bővíti — a különbség kizárólag abban van, MENNYIT használnak fel belőle, nem abban, hogy különböző memóriát kapnának.

### 3.3.1 Szimulált felejtés — a felhasználó kiegészítése, 2026-07-27

**Az AI legyen "emberibb" azzal, hogy néha felejt** — de a `RevealMemory`-ból SOSEM törlődik adat, kizárólag a FELHASZNÁLÁSÁRÓL dönt a döntéshozó pillanatában, döntésenként, cellánként újra-sorsolva. Ez modellez egy valódi embert, aki egyszer látott valamit, de nem biztos, hogy pontosan vissza is idézi — legközelebb (más döntésnél, vagy akár ugyanannál a cellánál egy KÉSŐBBI körben) simán eszébe juthat megint, hiszen a mögöttes tudás (a `Map`) érintetlen marad.

Új segédfüggvény, amit a MEDIUM/HARD stratégia minden `memory.get(cellId)` helyett hív:

```ts
// shared/games/ramses/ai/memory.ts
const FORGET_CHANCE: Record<RamsesAiDifficulty, number> = {
  EASY: 0,      // irreleváns — EASY eleve nem használja a memóriát
  MEDIUM: 0.35, // sűrűbben felejt (a felhasználó kérése szerint)
  HARD: 0.08,   // csak ritkán felejt
};

/** A memória TARTALMA nem változik — csak azt dönti el, hogy EBBEN a pillanatban "eszébe jut-e" az AI-nak, amit tud. Ugyanaz a cella egy másik döntésnél (vagy akár ugyanabban a döntésben, ha a hívó véletlenül kétszer kérdezi) más eredményt adhat. */
function recall(memory: RevealMemory, cellId: string, difficulty: RamsesAiDifficulty): string | null | undefined {
  if (Math.random() < FORGET_CHANCE[difficulty]) return undefined; // "nem jut eszébe" — úgy kezeli, mintha ismeretlen lenne
  return memory.get(cellId);
}
```

A MEDIUM/HARD stratégia minden ismert-cella-ellenőrzés (`memory.get(...)` a 3.3-as táblázat "ROSSZ kincset rejt" / "üres" / "jelenlegi cél-kincset rejti" ágaiban) ezen a `recall()` függvényen megy át közvetlen `memory.get()` helyett — egy "elfelejtett" cella egyszerűen ismeretlenként viselkedik az adott döntésben (ugyanúgy, mintha sosem látta volna), tehát a HARD-nál is előfordulhat, hogy egy valójában ismert rossz cellára csúsztat, ha "nem jut eszébe" — ritkábban, mint MEDIUM-nál, de nem nulla eséllyel, ez adja az emberi bizonytalanság érzetét.

**A konkrét felejtési arányok (0.35 / 0.08) kezdeti javaslatok, nincsenek playtesztelve** — pontosan úgy, mint a nehézségi szintek egyéb súlyai Hotel-0d-nél, a finomhangolás a felhasználó saját feladata valódi próbajátékok alapján, nem Claude-é (lásd `docs/hotel-0d-ai-specifikacio.md` §1 precedense).

### 3.3.2 EASY korlátozott rövid-távú emlékezete — a szimuláció alapján hozzáadva, 2026-07-27

A 7.1 szakaszban leírt AI-only szimuláció rávilágított: EASY az esetek **57%-ában szó szerint egyetlen kincset sem talált** — a felhasználó megerősítette, hogy ez a "legyőzhető, de ne teljesen használhatatlan" elvárást sérti, és egy enyhe javítást kért.

**Megoldás: EASY NEM kap teljes memóriát (ez a szint definíciója szerint elvi kérdés maradna, nem csak hangolás), hanem egy nagyon szűk, korlátozott "mit láttam épp az imént" ablakot** — a `RevealMemory` kiegészül egy `recentKeys: string[]` mezővel (a `full: Map` mellett, ami MEDIUM/HARD `recall()`-jának forrása marad, változatlanul):

```ts
// shared/games/ramses/ai/memory.ts
const EASY_RECENT_WINDOW = 3; // csak az utolsó 3 megfigyelt cella

export interface RevealMemory {
  full: Map<string, string | null>;   // MEDIUM/HARD forrása, változatlan
  recentKeys: string[];                // EASY forrása — a legutóbbi N megfigyelt cella id-je
}

/** EASY-nak SOSEM ad "ismert rossz" infót — csak azt jelzi, ha egy csúsztatható cella a JELENLEGI cél-kincset rejti, és ez a cella még a szűk ablakban van. */
export function recallEasy(memory: RevealMemory, cellId: string): string | null | undefined { ... }
```

`observeRevealedState` egyetlen hívással mindkét struktúrát frissíti (a hívási pontok — `RamsesRoom`/`useRamsesHotSeatAi`/`simulate.ts` — változtatás nélkül maradtak, hiszen csak a `RevealMemory` belső alakja változott, a rajta kívüli szerződés nem).

**EASY új viselkedése**: továbbra is túlnyomórészt véletlenszerű (nem kerüli az ismert rossz cellákat, nem keres aktívan üres mezőt) — az EGYETLEN változás, hogy ha egy csúsztatható cella a rövid-távú ablakban van ÉS épp a keresett kincset rejti, EASY felismeri és odacsúsztat ("ó, ezt épp most láttam!" — emberi, nem stratégiai felismerés). Ez szándékosan sokkal gyengébb, mint MEDIUM/HARD teljes memóriája — csak annyit ad, hogy EASY ne maradjon szisztematikusan esély nélkül.

**Eredmény** (lásd 7.1 frissített adatai): EASY "0 lapos parti" aránya 57%-ról ~48%-ra csökkent három ismételt szimulációs kör átlagában — enyhe, de valódi javulás, a nehézségi sorrend (HARD > MEDIUM > EASY) továbbra is teljesen érintetlen.

### 3.4 Mikor frissül a memória

`observeRevealedState` minden EGYES állapotváltozás után lefut — ember lépése, AI lépése, sőt a kezdő állapot után is (a kezdő üres mező garantáltan üres, ez is egy megfigyelés). Konkrét integrációs pontok:

- **Szerver (`RamsesRoom`)**: a már meglévő `syncState()` override a legjobb hely — ez pontosan egyszer fut le minden ténylegesen alkalmazott action után (ember- vagy AI-eredetű egyaránt), a `this.gameState` frissítése UTÁN, a `computeAiMove` esetleges hívása ELŐTT (lásd `GameRoom.applyAction` → `syncState()` → ... → `maybeTriggerAiMove()` sorrendet) — tehát mire egy AI-szlotot megkérdezünk, a memória már naprakész a legutóbbi lépésre nézve is.
- **Hot-seat (`useRamsesHotSeatAi`)**: a hook a transport `subscribe()`-ján keresztül már ma is figyeli MINDEN állapotváltozást (a `scheduleIfIdle` trigger miatt, lásd Hotel mintáját) — ugyanide kerül az `observeRevealedState` hívás is, plusz egy eagre hívás rögtön a hook indulásakor (a kezdő state-re).

## 4. Szerver-oldali integráció (`RamsesRoom`)

- `RamsesRoom` kap egy privát `private aiMemory: RevealMemory = createRevealMemory();` mezőt (EGY példány, nem szlotonkénti — lásd 3.1) és egy privát `getPublicGameState()` gettert (lásd 3.2).
- `syncState()` kiegészül: `observeRevealedState(this.aiMemory, this.getPublicGameState());` (a schema-szinkron mellett, sorrend mindegy — a getter mindig a friss `this.gameState`-ből számol).
- `computeAiMove(_state, slot)`: jelenleg mindig `null`-t ad vissza (lásd Ramses-0b lezárásakor írt stub-kommentet) — lecserélve: `return chooseRamsesAiAction(this.getPublicGameState(), this.aiMemory, slot, this.aiDifficulty);` (a kapott `_state` paramétert szándékosan nem használja, lásd 3.2).
- `aiDifficulty: RamsesAiDifficulty` mező + `onCreate`-ben `isRamsesAiDifficulty(options.aiDifficulty)` guard — 1:1 ugyanaz a minta, mint `HotelRoom`-nál (`GameRoomCreateOptions.aiOpponentCount`/`aiDifficulty` már ma is game-agnosztikus, semmi új kell a `GameRoom` alaposztályba).
- `resolveServerAction`/`aiMoveDelayMs`: `resolveServerAction`-t nem kell felülírni (a `SLIDE_PYRAMID` action nem hordoz kliens-generált véletlenszámot, mint Hotel dobásai — nincs mit szerver-oldalon újragenerálni). `aiMoveDelayMs()`-t viszont érdemes felülírni egy kis mesterséges késleltetésre (javaslat: **500ms**, Hotel 600ms-éhez hasonlóan) — enélkül egy AI-lánc (több egymást követő csúsztatás ugyanazon körön belül) egyetlen szemvillanás alatt lefutna, követhetetlenül.

## 5. Kliens-oldali integráció (hot-seat + minden más fogyasztó)

- `RamsesGamePage` a kapott (`providedTransport ?? localTransport`) transportot MINDIG becsomagolja egy `MaskedRamsesTransport`-tal (lásd 3.2), mielőtt `useGameTransport`-nak átadná — ez vonatkozik hot-seat ÉS online módra is (utóbbinál idempotens, hiszen a `ColyseusGameTransport` már eleve maszkolt state-et ad).
- Új `useRamsesHotSeatAi(transport, aiSlots, memory)` hook (`src/client/games/ramses/ui/`) — 1:1 mintázva `useHotSeatAi.ts`-re (Hotel), a különbség: a memóriát is karban tartja (`observeRevealedState` minden `subscribe()`-triggerre, plusz egy eager hívás induláskor). A `RamsesGamePage`-től MÁR a becsomagolt (maszkolt) transportot kapja meg, tehát egyszerűen `transport.getState()`-et hív — nincs szüksége saját, külön maszkoló segédre (a 3.2-ben korábban tervezett AI-specifikus `getPublicState(transport)` emiatt feleslegessé vált, nem kell megépíteni).
- `RamsesGamePageProps` bővül egy `hotSeatAiSlots?: Partial<Record<PlayerId, RamsesAiDifficulty>>` prop-pal — a hook a komponensben kerül meghívásra, ugyanúgy, mint `HotelGamePage`-ben.
- **Tábla-interakció AI körében**: a legutóbb (2026-07-27) rögzített elvet követve ("elég, ha nem reagál a pálya a játékos kattintására, nem kell külön üzenet") — `handleCellClick` egy új feltétellel bővül: ha a soron lévő játékos AI-vezérelt (`aiSlots[currentPlayer.id]` létezik), a kattintás no-op, ugyanúgy, mint online módban a `!isMyTurn` esetén. Nincs külön "AI gondolkodik…" felirat sem (konzisztens a korábbi döntéssel).
- `RamsesSetupPage.tsx` — soronkénti AI-jelölőnégyzet + egy közös nehézség-választó (csak akkor jelenik meg, ha legalább egy AI van bejelölve) — 1:1 `HotelSetupPage.tsx` mintája.

## 6. Lobby / `gamesRegistry.ts`

- `gamesRegistry.ts`-ben a Ramses bejegyzés kap egy `supportsAiOpponentCount: true` mezőt (`GameOnlineOptions`-ön már ma is létezik, játék-agnosztikus) — a `LobbyPage` "Új szoba" modalja emiatt automatikusan megjeleníti az AI-darabszám + nehézség választót, **nulla módosítás kell magában a `LobbyPage.tsx`-ben** (a `AiDifficulty` típus ott már ma is egy sima `'EASY'|'MEDIUM'|'HARD'` union, nem Hotel-specifikus import).

## 7. Tesztelés terve

- `shared/games/ramses/ai/memory.test.ts` — `observeRevealedState` helyesen jegyzi meg az üres mezőt (kincs vagy `null`), többszöri hívás felülírja/bővíti a térképet. `recall()`: `Math.random` mockolásával determinisztikusan tesztelhető mindkét ág (felejt / nem felejt); EASY-nél a `FORGET_CHANCE` irreleváns, hiszen a stratégia sosem hívja; és — a felhasználó kérésének explicit ellenőrzése — a mögöttes `RevealMemory` mérete/tartalma egy "elfelejtett" `recall()` hívás UTÁN is változatlan (a felejtés sosem törli az adatot, csak a pillanatnyi felhasználást befolyásolja).
- `RamsesRoom.getPublicGameState()` és `MaskedRamsesTransport` tesztje (nem a megosztott AI-modulban, hanem ott, ahol a maszkolás felelőssége van — lásd 3.2): mindkettő eredményében egy még lefedett cella `treasureId`-ja garantáltan `null`, még akkor is, ha a mögöttes `this.gameState`/a becsomagolt transport ismeri a valódi értéket. `MaskedRamsesTransport`-nál külön eset: egy MÁR maszkolt (pl. `ColyseusGameTransport`-ból jövő) state újra-maszkolása idempotens, nem dob hibát, nem változtat semmin.
- `shared/games/ramses/ai/strategy.test.ts` — mindhárom nehézségi szint viselkedése kézzel felépített (nem véletlenszerű) `buildTestState`+kézzel töltött memória forgatókönyveken: EASY figyelmen kívül hagyja a memóriát (statisztikai teszt sok mintával, vagy egy Math.random mock), MEDIUM kerüli az ismert rossz cellát ha van alternatíva, HARD sorrendben preferál (győzelem > ismert üres > ismeretlen > kényszerű rossz). Plusz egy Hotel `strategy.test.ts`-hez hasonló **"AI-only full game" smoke teszt**: vegyes nehézségű, csak-AI parti sok lépésen át fut hiba nélkül — Hotel precedense szerint NEM várja el, hogy a lépéskorláton belül `FINISHED`-be jusson (egy EASY-t is tartalmazó valós Ramses-parti korlátlan-farkú véletlen folyamat, ~15 000–20 000 csúsztatást is igényelhet).
- Élő ellenőrzés: a Ramses-0b-nél már bevált háromszintű minta (vitest + `temp/`-beli valós `@colyseus/schema`/Colyseus smoke teszt + élő böngészős Playwright-teszt, hot-seat AI-kapcsolóval).

### 7.1 IMPLEMENTÁLVA: `simulateRamsesGame` szimulációs modul + hangolási kör (2026-07-27, a felhasználó kérésére)

A felhasználó kifejezetten kérte a Hotel-0d-nél bevált módszer megismétlését: csak-AI szimulációk futtatása a nehézségi szintek teszteléséhez/beállításához. Új, önálló modul (`shared/games/ramses/ai/simulate.ts`, 1:1 Hotel `simulate.ts` mintája — nincs lobby UI, `GameRoom`/Colyseus, adatbázis, mesterséges "AI gondolkodik" késleltetés) + kötegelt futtató script (`scripts/simulate-ramses-ai-games.ts`, `npm run ai:simulate-ramses`).

**Fontos, empirikusan feltárt tény a modul megírása közben** (nem hiba, csak tervezési korrekció): mivel minden Ramses AI-döntés lényegében azonnali (nincs Hotel-szerű expectimax keresés), egy TELJES, valódi befejezésig lejátszott parti is olcsó — a szimulátor ezért (Hotel "vezetés a lépéskorlátnál" kompromisszumával ellentétben) VALÓDI, egyértelmű győzteseket vár be, `maxSteps=60 000` biztonsági korláttal (egy vegyes nehézségű, EASY-t is tartalmazó parti empirikusan ~15 000–20 000 lépést igényelhet).

**Eredmények (589 253 összlépés, 27 játék, 8,9 másodperc alatt lefutva):**

| Szint | Részvétel | Győzelem | Átlag pontszám | Átlag lapszám |
|---|---|---|---|---|
| EASY | 21 | 0 (0%) | 6,6 | 2,9 |
| MEDIUM | 15 | 5 (33%) | 19,6 | 7,8 |
| HARD | 31 | 22 (71%) | 50,5 | 20,8 |

A nehézségi létra a szándéknak megfelelően **monoton**: HARD > MEDIUM > EASY minden mérésben, minden összeállításban (2/3/4 fős vegyes lineupok is). Két konkrét megfigyelés, mindkettő megvizsgálva, egyik sem bizonyult hibának:

- **EASY 0%-os győzelmi aránya** — első pillantásra riasztónak tűnhet, de a tervezett viselkedésből (a memóriát teljesen figyelmen kívül hagyja) egyenesen következik egy memóriajátékban: aki semmit nem jegyez meg, gyakorlatilag esély nélkül marad bárkivel szemben, aki használ valamennyi memóriát — ez a FIZIKAI játék jellegéből fakad, nem AI-hibából. (Néhány pontot azért néha szerzett EASY MEDIUM ellen — nem teljesen esély nélküli, csak nagyon gyenge, ami egy kezdő/gyerek-barát szintnek pont megfelelő.)
- **MEDIUM 0/10-es vereség-sorozata konkrétan HARD ellen** (a 33%-os összesített arány kizárólag a Könnyű-elleni győzelmekből jön) — megvizsgálva: ez a `chooseMediumCell` szándékos, már a tervben rögzített viselkedéséből ered (csak az ismerten ROSSZ cellákat kerüli, de NEM keresi aktívan az ismert győzelmet/üres mezőt, még ha "tudná" is) — ez a tervezett különbség MEDIUM és HARD stratégiája között, nem kódhiba.
- **Kontroll-mérés (HARD vs HARD, azonos szint) egy külön, 20 játékos utólagos próbában**: az eredeti 5 játékos kötegben véletlenül 4/4-ben az 1. játékos (mindig ő kezd) nyert, ami elsőre kör-sorrendi torzításnak tűnhetett — egy nagyobb, 20 játékos külön próbában (`temp/`-ben, nem megtartva) 8-10 arányban oszlott meg, tehát **statisztikai véletlen volt, nem valódi elsőkörös előny**.

**Konklúzió (első kör)**: nem találtam valódi hibát (szemben Hotel-0d-vel, ahol a szimuláció egy tényleges fizetési hibát és egy kockázat-alulbecslést is feltárt) — a jelenlegi `FORGET_CHANCE` értékek (MEDIUM 0,35 / HARD 0,08) és a nehézségi szintek viselkedése első körben változatlanul hagyva, mivel az adatok nem mutattak diszfunkciót, csak a szándékolt nehézség-differenciálódást igazolták vissza.

### 7.2 Második kör: "talált-e egyáltalán kincset EASY/MEDIUM?" — a felhasználó kifejezett kérése, 2026-07-27, ugyanaznap

A felhasználó külön rákérdezett: a log alapján EASY/MEDIUM tényleg talál-e kincset, mert nem szeretné, ha teljesen használhatatlanok lennének. A szimulációs eszköz kapott egy új, pontos mérőszámot (**"0 lapos parti" arány** — hány játékban nem talált a szereplő EGYETLEN kincset SEM):

```
EASY   — 0 lapos parti: 12/21 (57%)
MEDIUM — 0 lapos parti: 3/15 (20%)
HARD   — 0 lapos parti: 2/31 (6%)
```

**Kiváltó ok**: nem AI-hiba, hanem a házi szabály (sikeres találat folytatja a kört) lavina-effektusa — ha egy memóriával rendelkező játékos (HARD) egyszer belelendül, akár az egész paklit végigviheti egyetlen megszakítatlan körben, mielőtt a gyengébb ellenfél egyáltalán lépne. Megkérdeztem a felhasználót: elfogadható-e ez egy explicit "legkönnyebb" szintnél, vagy javítsak rajta — **a válasz: enyhe javítás kérve, EASY maradjon egyértelműen a leggyengébb, de ne legyen ennyire esély nélküli.**

**Megvalósítva: EASY korlátozott rövid-távú emlékezete** (lásd 3.3.2 — `recallEasy`, `EASY_RECENT_WINDOW = 3`). Három ismételt szimulációs kör után:

```
EASY 0 lapos parti aránya: 57% → 48% → 48%  (enyhe, konzisztens javulás)
```

MEDIUM/HARD teljesen érintetlen (a rájuk mért ingadozás — 20%/33%/40% MEDIUM-nál — pusztán a kis mintaméret zaja, semmi nem változott a kódjukban).

**Konklúzió (második kör)**: a `FORGET_CHANCE` súlyok továbbra sem változtak, csak EASY kapott egy célzott, minimális kiegészítést. A pontos finomhangolás (pl. további arányok) változatlanul a felhasználó saját, valódi próbajátékokon alapuló döntése — lásd `docs/hotel-0d-ai-specifikacio.md` §1 precedense.

## 8. Diagram

Lásd [`docs/diagrams/ramses-0c-ai-architecture.puml`](./diagrams/ramses-0c-ai-architecture.puml) — a megosztott AI-modul és a két fogyasztója (RamsesRoom, useRamsesHotSeatAi), valamint a maszkolás pontos helye a döntési láncban.

## 9. Nyitott kérdés a felhasználó felé

- [x] **A 3.2 szakaszban leírt tervezési döntés** — **jóváhagyva, változtatás nélkül implementálva.**
- [x] **EASY 57%-os "0 lapos parti" aránya (7.1/7.2) — jóváhagyott, enyhe javítás implementálva** (3.3.2: korlátozott rövid-távú emlékezet).

## 10. Terv állapota

Első tervezési kör, 2026-07-27, ugyanazon a napon implementálva is.

**IMPLEMENTÁLVA — a terv 1:1 megvalósítva, egy real bug-fixszel útközben.** Minden a 3-6. szakaszban leírt darab elkészült: `shared/games/ramses/ai/{memory,strategy,index}.ts`, `RamsesRoom` `getPublicGameState()`/`aiMemory`/`computeAiMove`/`aiMoveDelayMs`, kliens `MaskedRamsesTransport.ts` + `useRamsesHotSeatAi.ts`, `RamsesGamePage` bekötve, `RamsesSetupPage` AI-jelölőnégyzet + nehézség-választó (1:1 Hotel mintája), `gamesRegistry.ts`/`RamsesOnlineGamePage.tsx` az `aiOpponentCount`/`aiDifficulty` paraméterekkel.

**Valós hiba találva és javítva élő böngészős teszt közben (amit sem a tsc, sem az eslint, sem a vitest nem tudott volna elkapni)**: a `MaskedRamsesTransport.getState()` eredeti implementációja minden hívásnál ÚJ objektumot hozott létre (`toPublicRamsesState(...)` frissen számolva), megsértve a `useSyncExternalStore` szerződését, ami stabil (cache-elt) snapshotot vár, ha nem történt tényleges változás — ez végtelen re-render hurkot okozott ("Maximum update depth exceeded"), amint a hot-seat AI-t bekapcsoltam és elindítottam egy partit. Javítás: a wrapper most a belső state OBJEKTUM-referenciája alapján cache-eli a maszkolt eredményt, csak akkor számol újra, ha a belső state ténylegesen megváltozott.

**Tesztelés, több szinten:**
- 18 új vitest teszt (`memory.test.ts`, `strategy.test.ts`, beleértve egy "AI-only full game" smoke tesztet) — 189/189 zöld a teljes projektben.
- Az "AI-only" smoke teszt tervezése közben egy valós, empirikusan kalibrált felismerés: egy kevert nehézségű (EASY-t is tartalmazó) valós Ramses-parti ~15 000–20 000 csúsztatást igényelhet a 30 lapos pakli kimerítéséhez (korlátlan-farkú véletlen folyamat) — a teszt végül, Hotel saját AI-only smoke tesztjének filozófiáját követve, NEM várja el a `FINISHED` állapotot a lépéskorláton belül, csak azt, hogy sok, változatos AI-döntés sose dobjon hibát.
- **Élő smoke teszt valós szerver+Postgres ellen** (`temp/ramses-ai-multiplayer-smoke-test.ts`): egy fontos architekturális tény tesztelés közben derült ki (nem hiba, csak tervezési tévhit a teszt saját első verziójában) — egy valóban "csak-AI, ember nélküli" szoba nem létező forgatókönyv ebben az architektúrában (a `GameRoom` mindig megköveteli egy valós kapcsolódó klienst a szoba létrehozásához/csatlakozáshoz, és az `aiOpponentCount` mindig `maxClients-1`-re van korlátozva) — a szoba-létrehozó mindig ember, mindig ő az 1. játékos, mindig ő kezd. A végleges teszt ezt figyelembe véve: az ember lépdel, amíg a kör ténylegesen át nem száll az AI-ra, majd ellenőrzi, hogy az AI onnantól teljesen felügyelet nélkül veszi át — sikeresen, nulla szivárgott kincs-infóval.
- **Élő böngészős ellenőrzés Playwright-tal mindkét módban**: hot-seat (AI-jelölőnégyzet bekapcsolva, a parti lépked, az AI a maga körén automatikusan lép, a kör helyesen vissza is száll az emberre rossz kincs felfedésekor); online (a lobby "Új szoba" modalja helyesen mutatja az AI-darabszám+nehézség választót, a létrehozott szobában az AI automatikusan lép, a pontszámítás/kártyahúzás/kör-váltás mind helyesen szinkronizálódik). Mindkét esetben nulla konzol-hiba (csak a már ismert, ártalmatlan `THREE.Clock` figyelmeztetés).

`tsc` (kliens+szerver), `eslint`, `vitest` (189/189), `vite build` (a `RamsesGamePage` lazy chunkja kicsit nőtt az AI-logikával, code-splitting sértetlen) mind zöldek.

**Második kör, ugyanaznap (2026-07-27) — a felhasználó kifejezett kérésére**: AI-only szimulációk `simulateRamsesGame`/`npm run ai:simulate-ramses`-szel (lásd 7.1/7.2), majd egy célzott, adat-vezérelt kiegészítés (EASY korlátozott rövid-távú emlékezete, 3.3.2) az 57%-os EASY "0 lapos parti" arány mérséklésére. A `RevealMemory` típus `Map`-ből egy `{full, recentKeys}` interfésszé alakult át — ez KIZÁRÓLAG `memory.ts`/`strategy.ts`-t és saját teszteiket érintette, a `RamsesRoom`/`useRamsesHotSeatAi`/`simulate.ts` integrációs pontok egyáltalán nem változtak (a `RevealMemory`-t mindig átlátszóan adják tovább, sosem nyúlnak bele közvetlenül). 60/60 Ramses-teszt zöld (54→60, +6), 3 ismételt szimulációs kör után EASY "0 lapos parti" aránya 57%→48%-ra csökkent, MEDIUM/HARD teljesen érintetlen.
