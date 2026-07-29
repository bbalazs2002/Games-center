# Dáma-0d — Specifikáció: AI nehézségi szintek

**Státusz:** IMPLEMENTÁLVA és élesben (élő böngészős teszttel, hot-seat ÉS online módban) ellenőrizve — lásd 14. szakasz. A **Dáma-0d.2** csak-AI szimulációs/hangolási kör is lezárva, egy valódi hibát is feltárva és javítva (KÖZEPES vs KÖZEPES determinisztikus holtpont) — lásd 13. szakasz.
**Utolsó frissítés:** 2026-07-28
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md) (roadmap-tétel 4c), [dama-0c-ai-specifikacio.md](./dama-0c-ai-specifikacio.md) (a jelenlegi, teljesen véletlenszerű AI — ezt a tervet ez váltja fel/egészíti ki), [hotel-0d-ai-specifikacio.md](./hotel-0d-ai-specifikacio.md) és [ramses-0c-ai-specifikacio.md](./ramses-0c-ai-specifikacio.md) (a két korábbi "valódi" AI-kör ebben a projektben — a mostani terv mindkettőből merít, de egyik mintát sem másolja 1:1, lásd 2. szakasz)

## 1. Cél és hatókör

**Kérés (2026-07-27/28):** a Dáma jelenlegi AI-ja (Fázis 0c) teljesen véletlenszerű, és kizárólag online multiplayer módban létezik — hot-seat AI-ellenfél egyáltalán nincs. A cél most: **három érdemben megkülönböztethető nehézségi szint** (Könnyű/Közepes/Nehéz), **hot-seat ÉS online módban egyaránt, egyetlen közös `shared/games/dama/ai/` modulból** — a Ramses-0c-nél bevált "kezdettől együtt tervezve, nem utólag összevonva" elvet követve (nem a Hotel-mintát, ahol a hot-seat AI csak utólag lett rácsatlakoztatva).

**Hatókörben van:**
- Minimax + alfa-béta metszéses keresési stratégia, heurisztikus kiértékeléssel (lásd 3-4. szakasz)
- Három nehézségi szint, keresési mélységgel paraméterezve (lásd 5. szakasz)
- `DamaRoom.computeAiMove` bővítése: ténylegesen figyelembe veszi a nehézségi szintet (ma nem teszi)
- **Új** `DamaSetupPage.tsx` — hot-seat módban ma nincs beállító képernyő, a játék azonnal két emberi játékossal indul; ez a terv hozza be az Ember/AI + nehézség választást hot-seat módra is (lásd 9. szakasz)
- **Új** `useDamaHotSeatAi` kliens-oldali hook — a Hotel/Ramses hot-seat AI hookjainak mintájára
- Online szoba-létrehozási UI bővítése: a Dáma jelenlegi bináris Ember/AI választója (`supportsAiOpponent`) kap egy nehézség-választót is, ha AI-t választanak — ma ez a mező egyáltalán nincs Dámánál bekötve (lásd 10. szakasz)

**Nincs hatókörben (ebben a körben):**
- A B-klaszter (Sakk, Dáma, Malom, Connect 4) egységes UI-ja — ez a `Projekt-conception.md` 4c tételének **másik**, önálló fele, külön tervezési kör tárgya, nem ez a dokumentum.
- Az értékelő függvény pontos súlyainak playtesztelt finomhangolása — ahogy Hotel-0d-nél és Ramses-0c-nél is, ez KIFEJEZETTEN NEM Claude feladata; a lenti súlyok kezdeti, ésszerű javaslatok.
- Szlotonkénti (LIGHT/DARK eltérő) nehézség — a Hotel-0d-nél már lezárt elv szerint (nincs rá igény) itt is egy nehézség vonatkozik az egész partira/szobára.
- ~~Csak-AI szimulációs eszköz~~ — a Hotel-0d/Ramses-0c mintát követve ez egy **implementáció utáni**, külön kör (**Dáma-0d.2**) volt, miután az alap AI már működött és élesben ellenőrizve volt — azóta megtörtént, lásd 13. szakasz.

## 2. Algoritmus-választás: miért minimax + alfa-béta, NEM expectimax

A projekt eddigi két "valódi" AI-ja más-más okból tért el a klasszikus minimaxtól:
- **Hotel** 2-4 fős ÉS kockadobás-vezérelt → expectimax kellett (véletlen-csomópontok + önjáték-feltevés, lásd `hotel-0d-ai-specifikacio.md` §4.2).
- **Ramses** rejtett információs (a kincsek nagy része nem látható) → a keresés helyett egy memória-alapú heurisztikus döntéshozó kellett, klasszikus fa-keresés nélkül.

**Dáma egyik problémával sem küzd**: pontosan 2 játékos, zéróösszegű, nulla véletlen (nincs kocka), teljes információjú (nincs rejtett állapot — a B-klaszter besorolás is ezt mondja: "nincs rejtett infó"). Ez pontosan a tankönyvi eset, amire a **minimax + alfa-béta metszés** való — ez az algoritmus, amivel a legtöbb klasszikus sakk/dáma-motor is dolgozik. Egyszerűbb, mint Hotel expectimaxa (nincs véletlen-csomópont, nincs önjáték-feltevés más szereplőkre), és nem is kell a Ramses-féle memória-mechanizmus (semmi nincs elrejtve).

## 3. Mozgás-generálás és a láncütés kezelése a keresésben

**Alapelv, ugyanaz mint eddig minden AI-nál ebben a projektben:** a keresés SOSEM léphet ki a motor saját `getMovablePositions`/`getValidMoves` (lásd `selectors.ts`) által megengedett halmazból, és a hipotetikus lépéseket a valódi, tiszta `reducer(state, action)` függvénnyel alkalmazza — nincs külön "szimulációs" logika, nincs esély arra, hogy a keresés illegális lépést fontolgasson.

**A láncütés (`chainCaptureFrom`) különleges eset, de a motor ezt már ma is természetesen kezeli**: amíg egy láncütés folyamatban van, `state.currentPlayer` NEM változik, csak a `chainCaptureFrom` mező mutatja, melyik bábu köteles folytatni. Ez azt jelenti, hogy **a keresési fa egy szintje = EGY `MOVE` akció, nem egy teljes kör** — a mélység minden egyes alkalmazott lépéssel nő, és a maximalizáló/minimalizáló szerep automatikusan azon múlik, hogy `state.currentPlayer` melyik oldal-e az adott csomópontban (nincs szükség külön "fejezzük be a láncütést, mielőtt lépünk mélyebbre" logikára — ez pontosan az a minta, amit a `GameRoom.maybeTriggerAiMove` már ma is követ lépésenként).

**Vállalt következmény, tudatosan dokumentálva:** egy hosszú, kényszerű láncütés-sorozat a saját oldalán "felemészti" a beállított mélység egy részét anélkül, hogy ez valódi ellenfél-lépéssel váltakozna — vagyis a konfigurált mélység nem pontosan "N saját teljes kör előretekintését" jelenti (szemben Hotel 4.4-es, "1 mélység = 1 teljes saját kör" definíciójával). Ez elfogadható egyszerűsítés: (a) ez a matematikailag korrekt minimax-fa a TÉNYLEGES játékon, csak a "mélység" paraméter nem intuitív "kör"-egységekben mérve; (b) láncütésnél a választási lehetőségek jellemzően kevesek (gyakran egyetlen folytatás van), tehát a "elpazarolt" mélység a gyakorlatban ritkán jelentős. Ha playtesztelés mást mutat, később átalakítható "1 mélység = 1 teljes kör" számításra (rekurzív alfejezet a láncütés végéig, Hotel mintájára) — ez a terv NEM zárja ki, csak nem ezzel indul, az egyszerűbb megoldás javára.

**Fontos szabály-részlet, amit a keresésnek nem kell külön kezelnie:** ez a Dáma-változat NEM követeli meg a maximális ütés-szabályt (nincs "a leghosszabb láncot KELL választani" megkötés — `getValidMoves` bármelyik legális ütést felkínálja). A keresés emiatt nem igényel külön "melyik a leghosszabb lánc" előszűrést — pontosan úgy vizsgál minden elérhető ütési opciót, ahogy egy ember is választhatna köztük.

## 4. Értékelő függvény (heurisztika)

Egy adott `DamaState`-re, egy adott játékos szemszögéből, súlyozott pontszám (`evaluateDamaState(state, forPlayer): number`):

| Tényező | Leírás | Kezdeti súly (javaslat, hangolandó) |
|---|---|---|
| **Anyagi egyensúly** | saját bábuk − ellenfél bábuk, a király többet ér | MAN = 1, KING = 1.5 |
| **Mobilitás** | saját legális lépések száma − ellenfél legális lépéseinek száma (`getMovablePositions().length` különbség) | kicsi súly, kb. 0.1/lépés |
| **Előrehaladás** | csak MAN-oknál: minél közelebb a promóciós sorhoz, annál jobb (a promóció felé nyomás) | kicsi súly, kb. 0.05/sor |

A pontos számok — a Hotel-0d/Ramses-0c mindkét esetben lezárt precedense szerint — **kezdeti, ésszerű becslések**, nem véglegesek; a tényleges finomhangolás a felhasználó saját playtesztelési feladata (lásd 1. szakasz).

**Amit NEM kell külön heurisztika-tagként modellezni:** a kötelező ütés szabálya (`hasAnyCapture`) már magába a `getValidMoves`-ba be van építve — a keresés emiatt automatikusan "látja" és helyesen kezeli azokat az állásokat, ahol az ellenfél kénytelen lesz ütni (nincs szükség egy külön "veszélyeztetett bábu" büntető tagra, mert ez a jövőbeli kényszer-lépés már szerepel a fa mélyebb szintjein).

## 5. Nehézségi szintek

| Szint | Stratégia | Indoklás |
|---|---|---|
| **Könnyű** | A jelenlegi, már élesben ellenőrzött `pickRandomMove` **változatlanul újrafelhasználva** (csak a helye költözik `shared/`-be, lásd 7. szakasz) | Nulla regressziós kockázat — ez a viselkedés már bevált. Fontos: a kötelező ütés szabálya a motor szintjén érvényesül (`getValidMoves` maga szűr rá), tehát a Könnyű AI akkor is helyesen üt, ha kell — csak STRATÉGIA nélkül választ a legális lépések közül, sosem játszik szabálytalanul. |
| **Közepes** | Minimax + alfa-béta, kis rögzített mélység (javaslat: **4** — kb. 2 saját "kör" mélységnyi, a 3. szakasz vállalt egyszerűsítésével) | Érdemben jobb a véletlennél (lát egyszerű csapdákat/nyereségeket), de nem "lát messze". |
| **Nehéz** | Minimax + alfa-béta, iteratív mélyítéssel egy időkorlátig (javaslat: **200ms**, Hotel-0d 4.5-ös SEARCH_TIME_BUDGET_MS precedensét követve), felső mélységi korláttal is (javaslat: 12) | Ténylegesen erős ellenfél — lásd 6. szakasz a biztonsági hálóról. |

**Miért nem "Könnyű = sekély minimax" is?** Megfontoltuk, de a már bevált, élesben ellenőrzött `pickRandomMove` újrafelhasználása egyszerűbb (nulla új kód a legalsó szinten) és jobban illeszkedik "a legkönnyebb szint tényleg kezdőknek/gyerekeknek való legyen" célhoz, mint egy "gyenge, de mégis számoló" AI. Ez nyitott pont — lásd 12. szakasz, ha inkább egy sekély (pl. 1-2 mélységű) minimaxot szeretnél Könnyűnek.

## 6. Iteratív mélyítés + kettős biztonsági háló (Hotel-0d mintája)

A Node.js szerver egyszálú — egy hosszú, szinkron keresés az ADOTT pillanatban blokkolná a szerver ÖSSZES szobáját (nemcsak a Dáma-partit). Hotel-0d ugyanezt a kockázatot már megoldotta egy **kettős, egymástól független biztonsági hálóval** (`hotel-0d-ai-specifikacio.md` §4.5/§8), ugyanezt vesszük át:

- **Idő-költségvetés** (Nehéz: 200ms) — iteratív mélyítés: a keresés 1, majd 2, 3, ... mélységen fut újra, és minden mélység befejezése után ellenőrzi, van-e még idő a következőre; ha nincs, a legutóbb BEFEJEZETT mélység legjobb lépésével tér vissza. (Az iteratív mélyítés emellett ingyen ad egy jó mellékhatást: a korábbi, sekélyebb mélységek eredménye felhasználható lépés-sorrendezésre a következő, mélyebb futásnál — alfa-béta hatékonyabb metszést kap tőle. v1-ben ez opcionális finomítás, nem blokkoló.)
- **Csomópont-/mélység-felső korlát** (Nehéz: 12) — függetlenül az időkerettől, mert egy JS hívási verem másodperc törtrésze alatt kimerülhet, ha a keresés valamiért szélesebbre fut, mint várt (pl. sok király egyszerre a pályán → sok "repülő király" irány → nagyobb elágazási tényező).

Közepes szintnél (rögzített 4 mélység, nincs iteratív mélyítés/időkorlát) ez nem szükséges — egy 4 mélységű Dáma-fa alfa-béta metszéssel tipikusan ezredmásodpercek alatt lefut, nincs valós blokkolási kockázat.

## 7. Modul-elrendezés — közös hot-seat + online modul a kezdetektől

```
src/shared/games/dama/ai/
  heuristic.ts    # ÚJ — evaluateDamaState(state, forPlayer): number
  search.ts       # ÚJ — minimax + alfa-béta + iteratív mélyítés, tisztán a
                  #      reducer/selectors-ra épül, nincs saját mutáció
  randomMoveStrategy.ts  # ÁTKÖLTÖZTETVE server/games/dama/ai/-ból — a
                  #      Könnyű szint stratégiája, változatlan logika
  strategy.ts     # ÚJ — chooseDamaAiAction(state, difficulty): DamaAction | null
                  #      egyszerű dispatch: EASY -> pickRandomMove,
                  #      MEDIUM/HARD -> search.ts (a megfelelő paraméterekkel)
  index.ts        # ÚJ — barrel export, DamaAiDifficulty típus + isDamaAiDifficulty,
                  #      DAMA_AI_MIN_THINK_DELAY_MS (lásd 9.3 szakasz)
```

**Miért `randomMoveStrategy.ts` shared-be költözik:** pontosan ugyanaz az indoklás, mint Hotel-0d §9-ben a teljes `shared/games/hotel/ai/`-ra — a fájl semmilyen szerver-specifikus API-t nem használ (nincs fs/Prisma/Colyseus), csak a motort és `Math.random()`-ot, tehát természeténél fogva megosztott kód, csak eddig csak a szerver használta. A `.test.ts` fájlja vele költözik.

**Nincs `MaskedXTransport`-szerű réteg** (szemben Ramses-0c-vel) — Dáma nyílt információs játék, nincs mit maszkolni.

## 8. Szerver-oldali integráció (`DamaRoom`)

Ugyanaz a minta, mint `HotelRoom`/`RamsesRoom`-nál (`hotel-0d-ai-specifikacio.md` §3.1 általánosítása, amit `GameRoom` core már ma is biztosít — `aiOpponentCount`/`aiDifficulty` mezők a `GameRoomCreateOptions`-on már léteznek, csak `DamaRoom` nem olvassa még ki a nehézséget):

```typescript
// src/server/games/dama/DamaRoom.ts (kiegészítés)
import { chooseDamaAiAction, isDamaAiDifficulty, type DamaAiDifficulty } from '../../../shared/games/dama/ai';

export class DamaRoom extends GameRoom<DamaState, DamaAction, Player> {
  // ... változatlan ...
  private aiDifficulty: DamaAiDifficulty = 'MEDIUM';

  async onCreate(options: GameRoomCreateOptions): Promise<void> {
    await super.onCreate(options);
    if (isDamaAiDifficulty(options.aiDifficulty)) this.aiDifficulty = options.aiDifficulty;
  }

  protected computeAiMove(state: DamaState, slot: Player): DamaAction | null {
    if (state.currentPlayer !== slot) return null;
    return chooseDamaAiAction(state, this.aiDifficulty);
  }
}
```

**Nincs `GameRoom` core-változtatás** — az `aiDifficulty?: string` mező már ma is game-agnosztikus (jelenleg csak Hotel/Ramses olvassa ki), Dáma egyszerűen a harmadik fogyasztója lesz, változtatás nélkül a bázisosztályban.

## 9. Kliens-oldali integráció

### 9.1 ÚJ: `DamaSetupPage.tsx`

Ma a Dáma hot-seat módban nincs beállító képernyő — `src/client/games/dama/index.ts` közvetlenül a `DamaGamePage`-et exportálja, a játék rögtön két emberi játékossal indul. Ez a terv egy `HotelSetupPage`/`RamsesSetupPage` mintájú, de a fix 2-fős Dámához igazított, egyszerűbb beállító oldalt vezet be:

```
┌───────────────────────────┐
│  Dáma — helyi játék        │
│                            │
│  Ellenfél:                │
│  ⦿ Ember      ⦾ AI         │
│                            │
│  Nehézség (ha AI):        │
│  ⦾ Könnyű ⦿ Közepes ⦾ Nehéz│
│                            │
│           [Játék indítása]│
└───────────────────────────┘
```

Indításkor a `DamaGamePage`-nek átadott `hotSeatAiSlots: Partial<Record<Player, DamaAiDifficulty>>` prop épül fel (pl. `{ DARK: 'MEDIUM' }`, ha a második oldalt AI viszi) — a `Player` típus itt `'LIGHT'|'DARK'`, nem `player-1`/`player-2` string, szemben Hotel/Ramses-szel, mert a Dáma motor mindig ezt a két konkrét szlotnevet használja.

`src/client/games/dama/index.ts` frissül: `export { DamaSetupPage as default } from './ui/DamaSetupPage';` (a jelenlegi `DamaGamePage` export megszűnik alapértelmezettként, de a komponens maga változatlanul újrafelhasználható marad, ahogy `HotelGamePage`/`RamsesGamePage` is az).

### 9.2 ÚJ: `useDamaHotSeatAi`

Pontosan a `useHotSeatAi`/`useRamsesHotSeatAi` mintája: figyeli a helyi `GameTransport`-ot, minden állapotváltozás után megnézi, van-e AI-szlot soron (`state.currentPlayer` egyezik-e egy `hotSeatAiSlots` kulccsal), és ha igen, `chooseDamaAiAction`-t hív és közvetlenül dispatch-el. Nincs hálózat, nincs `GameRoom` — a `LocalGameTransport`-tal dolgozik közvetlenül, ahogy eddig is minden hot-seat AI hook ebben a projektben.

### 9.3 "AI gondolkodik…" — alacsony MINIMUM gondolkodási idő, nem fix késleltetés

**Lezárva, a felhasználó válasza alapján (2026-07-28):** legyen egy alacsony minimum gondolkodási idő; ha a keresés ezt magától túllépi, nem kell hozzá többet adni. Ez eltér a Hotel/Ramses mintától (`HOTEL_AI_MOVE_DELAY_MS`/`RAMSES_AI_MOVE_DELAY_MS` — ott a döntéshozatal gyakorlatilag azonnali, ezért egy FIX késleltetés van rátéve minden lépésre), mert Dámánál a Közepes/Nehéz keresés maga is valódi, változó, nem nulla időt vesz igénybe — felesleges lenne egy fix késleltetést rátenni egy már amúgy is ~150-200ms-ig tartó keresésre.

**Tervezett mechanizmus:** egy közös `DAMA_AI_MIN_THINK_DELAY_MS` konstans (javaslat: **300ms** — alacsony, de észlelhető; a pontos érték playteszteléssel hangolható, ugyanúgy nem Claude feladata, mint a többi UX-időzítés ebben a projektben). A hívó (mind `DamaRoom`, mind `useDamaHotSeatAi`) méri a `chooseDamaAiAction` tényleges futási idejét (`Date.now()` a hívás előtt/után), majd a különbözet hiányzó részét várja ki, mielőtt alkalmazza a lépést: `Math.max(0, DAMA_AI_MIN_THINK_DELAY_MS - elapsedMs)`.
- **Szerver oldal:** a meglévő `GameRoom.aiMoveDelayMs()` hookba illeszkedik (`RamsesRoom`/`HotelRoom` már ma is felülírja fix értékkel) — `DamaRoom` felülírja úgy, hogy a legutóbb mért keresési időt (`lastAiSearchElapsedMs` mező, amit `computeAiMove` állít be) vonja le a minimumból. Nincs `GameRoom` core-változtatás, a hook szignatúrája már ma is ezt engedi (zéró-paraméteres, a felülíró osztály bármilyen belső állapotot felhasználhat).
- **Kliens oldal (hot-seat):** `useDamaHotSeatAi` ugyanezt a mérés+kivárás mintát követi `setTimeout`-tal, mielőtt dispatch-eli a kiszámolt lépést.
- **Könnyű szint** (a véletlen választás gyakorlatilag azonnali) szinte mindig megkapja a teljes 300ms-et; **Nehéz szint**, ha a keresés már magától elérte/túllépte a minimumot, semmi extra várakozást nem kap.

## 10. Online szoba-létrehozási UI — a bináris Ember/AI választó nehézség-mezővel bővül

Ma (`LobbyPage.tsx`) a Dáma `game.online.supportsAiOpponent === true` ága kizárólag az `OpponentTypeFieldset`-et (Ember/AI rádiógomb) jeleníti meg — **nincs hozzá nehézség-választó**, és `applyOpponentParams` sosem küld `aiDifficulty` paramétert ezen az ágon (`applyAiOpponentCountParams` csak a Hotel/Ramses-féle `supportsAiOpponentCount` ágon fut le). Ez a terv ezt egészíti ki:

- Amikor `opponentType === 'AI'`, egy kis nehézség-választó (Könnyű/Közepes/Nehéz) jelenik meg, ugyanazzal a meglévő `AiDifficulty` típussal, amit a `AiOpponentCountFieldset` már használ — nem egy párhuzamos típus, csak egy párhuzamos, kisebb fieldset (`OpponentTypeFieldset` mellett, nem `AiOpponentCountFieldset` helyett, mert Dámánál a "hány AI" kérdés nem értelmezhető, mindig pontosan 0 vagy 1).
- `applyOpponentParams` kiegészül: ha `game.online.supportsAiOpponent && opponentType === 'AI'`, állítsa be az `aiDifficulty` paramétert is.
- `DamaOnlineGamePage.tsx` (jelenleg nem olvas `aiDifficulty` search paramot) kiegészül, hogy ezt kiolvassa és `options.aiDifficulty`-ként adja át a `colyseusClient.create('dama', { ..., aiDifficulty }, ...)` hívásnak — ugyanaz a minta, mint `HotelOnlineGamePage`/`RamsesOnlineGamePage`-nél.

Nincs `GameRoom`/`LobbyPage` szerkezeti változás, csak Dáma eddig kihasználatlan `aiDifficulty` útvonalának bekötése egy már létező, game-agnosztikus mezőre.

## 11. Diagram

Lásd: [diagrams/dama-0d-ai-architecture.puml](./diagrams/dama-0d-ai-architecture.puml) — a megosztott `shared/games/dama/ai/` modul felépítése és a szerver/kliens integrációs pontok, a Ramses-0c architektúra-diagram stílusát követve.

## 12. Nyitott pontok — lezárva (2026-07-28, a felhasználó válaszai)

- [x] **Algoritmus: minimax + alfa-béta, iteratív mélyítéssel a Nehéz szinten** (2-3. szakasz) — **megerősítve.** ("Rendben van, én is ezt választanám.")
- [x] **Könnyű szint = a meglévő, változatlan `pickRandomMove` újrafelhasználása** (5. szakasz) — **megerősítve**, marad a véletlen.
- [x] **Kezdeti mélységek/időkorlát** (5-6. szakasz) — a javasolt számok (Közepes=4, Nehéz=200ms/12-es felső korlát) **csak kiindulási érték az implementációhoz**; a végleges értékeket a Dáma-0d.2 csak-AI szimulációs kör adja majd (lásd 13. szakasz), a Hotel-0d/Ramses-0c mindkét esetben bevált mintáját követve.
- [x] **Heurisztika kezdeti súlyai** (4. szakasz) — szintén a Dáma-0d.2 szimulációs körben finomhangolandó, nem most.
- [x] **"AI gondolkodik…" időzítés** (9.3 szakasz) — **megerősítve, de módosított formában**: nem fix késleltetés (mint Hotel/Ramses), hanem egy alacsony MINIMUM gondolkodási idő (javaslat: 300ms) — ha a keresés ezt magától túllépi, nincs extra várakozás. Lásd 9.3 szakasz a pontos mechanizmusért.
- [x] **Simulate-eszköz ütemezése** — **megerősítve**, implementáció + élő ellenőrzés utáni, külön fázis, elnevezve **Dáma-0d.2**-nek (a Hotel-0d.2 elnevezési mintája szerint) — lásd 13. szakasz.

**Minden nyitott pont lezárva — az implementáció megkezdhető.**

## 13. Dáma-0d.2: csak-AI szimuláció a nehézségi szintek finomhangolásához

**IMPLEMENTÁLVA és lefuttatva (2026-07-28).** A Hotel-0d.2/Ramses-0c §7.1 mintáját követve: `shared/games/dama/ai/simulate.ts` (`simulateDamaGame`) + `scripts/simulate-dama-ai-games.ts` (`npm run ai:simulate-dama`) — közvetlenül a motort hajtó (nincs `GameRoom`/Colyseus/adatbázis) szimulációs eszköz, ami tetszőleges nehézségi-szint felállással lejátssza a motort a játék végéig (vagy `maxSteps`-ig, alapértelmezetten 4000, a köteg-szkript saját 1500-as korláttal hívja, lásd 13.1).

### 13.1 Valódi hiba találva és javítva: KÖZEPES vs KÖZEPES determinisztikus holtpont

Az első futtatás (18 parti, ~11 perc) egy valódi problémát tárt fel: **mindhárom Közepes vs Közepes kontroll-parti elérte a 4000 lépéses korlátot** (egyenként ~190-200 másodperc alatt), és **pontosan ugyanazzal a 3-1 bábuarányú végállással** zárult mindhárom alkalommal. Mivel a KÖZEPES szint (rögzített mélységű keresés, semmi véletlen elem) teljesen determinisztikus, ez gyanús volt — egy külön ellenőrző szkripttel (`temp/`, nem megtartva) megerősítve: **a keresés egy pontos, 4 lépéses ismétlődő körbe ragadt** (a 91. lépéstől kezdve ugyanaz az állás tért vissza újra és újra). Gyökér-ok: a motorban nincs döntetlen-szabály (se lépés-ismétlés, se "N lépés ütés nélkül"), és a `findBestMoveFixedDepth` korábban mindig az ELSŐ, azonos pontszámú lépést tartotta meg egyenlő állások közül — két egyforma erősségű, teljesen determinisztikus fél emiatt egy stabil, végtelenül ismétlődő "holtpontba" (zugzwang-szerű, kitörés nélküli lépés-párba) kerülhetett.

**Felhasználói döntés (AskUserQuestion, 2026-07-28):** a felkínált három lehetőség közül ("véletlenszerű döntetlenség-feloldás a keresésben" / "valódi döntetlen-szabály a motorban" / "csak a lépéskorlát csökkentése") a felhasználó az elsőt, **ajánlott** opciót választotta.

**Javítás (`search.ts`):** `findBestMoveFixedDepth` mostantól az összes, a legjobb pontszámmal PONTOSAN egyenlő lépést összegyűjti, és **véletlenszerűen** választ közülük — a korábbi "mindig az első legjobb" helyett. Ez kizárólag az AI-modult érinti, semmilyen játékszabály nem változott. Új teszt (`search.test.ts`) egy mesterséges, pontosan egyenlő 2 lépéses szituációval, `Math.random` mockolásával igazolja a véletlenszerű választást.

**Eredmény, újra lefuttatva:** a Közepes vs Közepes kontroll mindhárom partija a javítás után **döntő eredménnyel zárult** (77/117/59 lépésben) — a korábbi 100%-os beragadási arány megszűnt erre a felállásra. **Fontos, tisztázott korlát**: a javítás CSÖKKENTI, de nem szünteti meg teljesen a kockázatot — egy második, teljes köteg-futtatás során 2/18 parti (egy Közepes vs Nehéz és egy Nehéz vs Nehéz, mindkettő egy-egy király végjátékban) továbbra is elérte a lépéskorlátot. Ennek oka feltehetően az, hogy egy csupasz király-végjátékban gyakran NINCS valódi holtjáték (egyértelműen egyetlen "legjobb" lépés van minden állásban, apró mobilitás-különbség miatt), így a véletlenszerű döntetlenség-feloldásnak sosincs esélye beavatkozni — ez egy ismert, klasszikus jelenség a repetíció-észlelés nélküli minimax-motoroknál.

**Miért nem érinti ez a valódi felhasználókat:** a jelenség KIZÁRÓLAG két, egymással szemben álló, egyforma nehézségű AI között fordul elő — a `GameRoom.aiOpponentCount` mindig `maxClients - 1`-re korlátozva biztosítja, hogy online módban sosem lehet mindkét oldal AI, és a hot-seat `DamaSetupPage` is csak egyetlen (a SÖTÉT) oldalt engedi AI-vá tenni. Egy valódi (hot-seat vagy online) Dáma-partiban tehát **mindig van legalább egy emberi döntéshozó**, ami strukturálisan lehetetlenné teszi ezt a fajta stabil, tükör-szimmetrikus holtpontot — a jelenség kizárólag a Dáma-0d.2 szimulációs eszköz saját, AI-vs-AI kontroll-partijait érintette.

### 13.2 Végleges hangolási eredmények

A javítás utáni, teljes köteg-futtatás (18 parti, `BATCH_MAX_STEPS=1500`) eredménye:

| Nehézség | Részvétel | Győzelem | Győzelmi arány | Lépéskorlátot elérő parti |
|---|---|---|---|---|
| Könnyű | 12 | 3 | 25% | 0 |
| Közepes | 12 | 6 | 50% | 1 |
| Nehéz | 12 | 7 | 58% | 3 |

A nehézségi létra **monoton és a szándéknak megfelelő** (Könnyű < Közepes < Nehéz), a Ramses-0c/Hotel-0d mindkét esetben lezárt precedense szerint ez azt jelenti, hogy **a kezdeti tervben javasolt mélységek/időkorlát/heurisztika-súlyok (5-6/4. szakasz) nem igényelnek további módosítást** — az adatok igazolják a meglévő tervezést, nem hibát jeleznek. A pontos finomhangolás (pl. a Közepes 50%-os győzelmi aránya közelebb hozható-e a Nehézhez, vagy inkább távolabb tartandó tőle) továbbra is a felhasználó saját playtesztelési feladata, ugyanaz a határvonal, mint Hotel-0d/Ramses-0c esetében.

**A köteg-szkript saját lépéskorlátja** (`BATCH_MAX_STEPS = 1500`, a `simulateDamaGame` API saját, általánosabb 4000-es alapértelmezése helyett) — kizárólag gyakorlati/futásidő okból: egy beragadt Nehéz-résztvevős parti a Nehéz szint valós keresési költsége miatt akár 800+ másodpercig is futhatna 4000 lépésig, ami feleslegesen lassítja a köteg-futtatást anélkül, hogy új információt adna a ~120. lépés után.

## 14. Implementáció

A terv (2-11. szakasz) egy az egyben megvalósult, a lenti pontokban leírt eltérésekkel/pontosításokkal.

**Elkészült:**
- `src/shared/games/dama/ai/` — `heuristic.ts` (`evaluateDamaState`), `search.ts` (`findBestMoveFixedDepth`/`findBestMoveIterative`), `strategy.ts` (`chooseDamaAiAction`/`DamaAiDifficulty`/`isDamaAiDifficulty`), `index.ts` (barrel + `DAMA_AI_MIN_THINK_DELAY_MS`), és a `server/games/dama/ai/`-ból átköltöztetett `randomMoveStrategy.ts` (+ tesztje).
- `DamaRoom.ts` — `aiDifficulty` mező + `onCreate` felülírás, `computeAiMove` a `chooseDamaAiAction`-t hívja, `aiMoveDelayMs()` a 9.3-ban tervezett minimum-gondolkodási-idő logikát valósítja meg.
- **Új** `DamaSetupPage.tsx`/`.module.css` — hot-seat Ember/AI + nehézség választó, `src/client/games/dama/index.ts` alapértelmezett exportja erre vált (a korábbi `DamaGamePage` export megszűnt, a komponens maga változatlanul újrafelhasználható).
- **Új** `useDamaHotSeatAi.ts` — hot-seat AI hook, ugyanazzal a minimum-gondolkodási-idő elvvel, mint a szerver oldal.
- `DamaGamePage.tsx` — `hotSeatAiSlots` prop, `isCurrentPlayerAi` kapu (kattintás- és kiemelés-tiltás AI körében, Ramses `isCurrentPlayerAi` mintáját követve), "(AI gondolkodik…)" felirat a kör-jelzőben (Hotel `StatusChip` mintáját követve).
- `LobbyPage.tsx` — `OpponentTypeFieldset` (Dáma bináris Ember/AI ága) kiegészült egy nehézség-választóval; a duplikált `<select>`-jelölés egy közös `AiDifficultySelect` komponensbe lett kiemelve, amit az `AiOpponentCountFieldset` (Hotel/Ramses) is újrahasznál. `applyOpponentParams`/`buildCreateOptions` (`DamaOnlineGamePage.tsx`) az `aiDifficulty` paramétert végigviszi a szerverig.
- 25 új teszt (`heuristic.test.ts` 6, `search.test.ts` 6, `strategy.test.ts` 5, a költöztetett `randomMoveStrategy.test.ts` változatlan 2 + a meglévő 3+10+9 motor-teszt) — Dáma teszt-csomag összesen 41 teszt (`npm run test:dama`), projekt-szinten 212/212 zöld.

### 14.1 Eltérések a tervtől, amik implementáció közben derültek ki

- **A "minimum gondolkodási idő" a GameRoom meglévő `aiMoveDelayMs()` hook-jába illeszkedik, de az EGY LÉPÉSSEL KÉSLELTETETT mérést használja, nem a soron következő lépését.** A terv 9.3 szakasza némileg leegyszerűsítve fogalmazott ("a hívó méri a `chooseDamaAiAction` tényleges futási idejét") — a valóságban a `GameRoom.maybeTriggerAiMove` a `aiMoveDelayMs()`-t MÉG A `computeAiMove` meghívása ELŐTT lekérdezi (lásd `GameRoom.ts` — a metódus semmilyen game-specifikus állapotot nem kap át közvetlenül a lépéshez), tehát a KÖVETKEZŐ lépés tényleges gondolkodási ideje eleve nem ismert előre. Megoldás — **szándékosan nem a `GameRoom` core módosításával, hanem egy egyszerű közelítéssel**: `DamaRoom.computeAiMove` minden tényleges keresés után elmenti a mért időt (`lastAiThinkElapsedMs`), és `aiMoveDelayMs()` EZT az ELŐZŐ lépésből származó értéket használja a következő lépés késleltetéséhez. Mivel egy adott szobában a nehézség (és ezzel a jellemző keresési idő) a teljes parti alatt állandó, ez a közelítés az első lépés után gyakorlatilag pontos — csak a szoba/parti legelső AI-lépésénél kapja meg mindig a teljes minimumot (`lastAiThinkElapsedMs` kezdőértéke 0). A kliens-oldali `useDamaHotSeatAi`-nak NINCS erre a kompromisszumra szüksége (nem köti semmilyen meglévő hook-szerződés), ott a lépés kiszámítása és a késleltetés-számítás ugyanabban a függvényhívásban, valóban a soron következő lépésre nézve pontosan történik.
- **A "csomópont-/mélység-felső korlát" időbeli biztonsági hálója ténylegesen egy megszakítás-alapú (exception-throw) mechanizmust igényelt, nem csak a mélységi ciklusok közötti ellenőrzést.** A terv 6. szakasza a biztonsági hálót "iteratív mélyítés, mélységenkénti ellenőrzéssel" formában írta le — implementáció közben kiderült, hogy Dáma branching faktora (átlag ~4-8 lépés/állás, lépés-sorrendezés nélküli alfa-béta mellett) miatt egyetlen, még be nem fejezett mélységi szint önmagában is túlfuthatna a 200ms-es időkereten, ha csak a mélységek KÖZÖTT ellenőriznénk az órát. Megoldás: egy `SearchTimeBudgetExceeded` belső kivétel, amit a `minimax` rekurzió minden 500. meglátogatott csomópontnál (nem minden csomópontnál — a `Date.now()` hívásnak is van költsége) ellenőriz és szükség esetén eldob; a `findBestMoveIterative` ezt elkapja, és a MEGSZAKÍTOTT mélység eredményét teljesen eldobja (nem használja fel részlegesen — az alfa-béta "eddigi legjobb" állapota nem megbízható egy befejezetlen testvér-összehasonlítás után), a legutóbb TELJESEN befejezett mélység lépésével tér vissza.
- **Nincs eltérés** a modul-elrendezésben (7. szakasz), a szerver-/kliens-integrációban (8-10. szakasz) — mindkettő a tervezett formában valósult meg.

### 14.2 Ellenőrzés

- `tsc --noEmit` mindkét oldalon (kliens + szerver) — tiszta.
- `eslint` az érintett mappákon (`src/shared/games/dama`, `src/server/games/dama`, `src/client/games/dama`, `src/client/shell/lobby`) — egy komplexitás-figyelmeztetést talált (`applyOpponentParams`), egy kis segédfüggvény-kiemeléssel javítva (`applyBinaryAiOpponentParams`), ugyanaz a minta, mint a kódbázis korábbi hasonló javításai.
- `npm run test` — 212/212 teszt zöld (Dáma: 41).
- `npm run build` — tiszta, a code-splitting nem sérült (a Dáma hot-seat továbbra is önálló chunk).
- **Élő böngészős ellenőrzés (Playwright), mindkét módban:**
  - **Hot-seat**: `DamaSetupPage`-en AI + NEHÉZ nehézség kiválasztva, játék indítva, VILÁGOS (ember) lépett, majd a SÖTÉT (AI, NEHÉZ) automatikusan, felügyelet nélkül lépett és visszaadta a kört — a kör-jelző helyesen "Soron van: Sötét (AI gondolkodik…)" majd "Soron van: Világos" közt váltott, konzolhiba nélkül (csak az ártalmatlan favicon-404).
  - **Online**: a lobby "Új szoba" modaljában az AI választásakor megjelent a nehézség-választó (korábban Dámánál egyáltalán nem létezett); egy 1 ember + 1 AI (KÖNNYŰ) szoba azonnal elindult; VILÁGOS (ember) lépett, a szerver-oldali AI (SÖTÉT, KÖNNYŰ) valós Colyseus-kapcsolaton keresztül automatikusan válaszolt, a kör helyesen visszakerült VILÁGOS-hoz, konzolhiba nélkül.
