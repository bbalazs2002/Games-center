# Dáma — tesztek

Futtatás: `npm run test:dama` (42 teszt, 7 fájl). Lásd [README.md](./README.md) az általános konvenciókért.

## `src/shared/games/dama/engine/rules.test.ts` (10 teszt)

A tiszta lépés-generáló függvények — a reducer és a `getMovablePositions` selector is ezekre épül, nem duplikálja a logikát.

- **`findSimpleMoves`** (2 teszt) — egy BÁBU csak átlósan, üres mezőre léphet előre; blokkolva van, ha a cél mező foglalt (akár saját bábuval is).
- **`findCaptureMoves`** (4 teszt) — egy BÁBU mind a 4 átlós irányban üthet; nincs ütés, ha a leszállómező foglalt; egy repülő KIRÁLY több leszállómezőt is felajánlhat; egy KIRÁLY nem ugorhat át két bábun ugyanabban az irányban.
- **`hasAnyCapture` / `hasAnyLegalMove`** (2 teszt) — igaz, ha bármelyik saját bábu üthet; `hasAnyLegalMove` hamis, ha a játékosnak nincs egyetlen bábuja sem.

## `src/shared/games/dama/engine/selectors.test.ts` (3 teszt)

`getMovablePositions` — a UI ebből tudja, mely mezők kattinthatók.

- Minden lépésképes saját bábu-mező szerepel az eredményben, ha nincs kötelező ütés.
- Kötelező ütés esetén csak az ütni képes bábu(k) mozgathatók.
- Egy teljesen blokkolt bábu nem jelenik meg az eredményben.

## `src/shared/games/dama/engine/reducer.test.ts` (9 teszt)

A `(state, action) → newState` reducer maga.

- **Kezdőállapot** (1) — VILÁGOS kezd, 12-12 bábu a táblán.
- **Egyszerű lépés** (3) — érvényes lépésnél a bábu lép és a kör átadódik; érvénytelen célmezőre lépés no-op (ugyanaz a state-referencia); a kötelező-ütés szabály miatt egy nem-ütő lépés érvénytelen, ha máshol van ütési lehetőség.
- **Ütés** (2) — ütésnél a bábu eltűnik és a kör átadódik, ha nincs további ütés; lánc-ütésnél a kör NEM adódik át, amíg ugyanaz a bábu tovább üthet.
- **Bábuvá válás (király)** (2) — az utolsó sorba érő egyszerű lépés királlyá változtatja a bábut; szabály-döntés: a királlyá válás megszakítja a lánc-ütést, még ha lenne is további ütési lehetőség.
- **Győzelem-felismerés** (1) — az ellenfél utolsó bábujának leütése az ütő oldal győzelmét jelenti.

## `src/shared/games/dama/ai/randomMoveStrategy.test.ts` (2 teszt)

A Fázis 0c AI-ellenfél EASY nehézségi szintjének stratégiája (`pickRandomMove`) — Dáma-0d-ben átköltözött `server/games/dama/ai/`-ból `shared/games/dama/ai/`-ba, hogy hot-seat módban is felhasználható legyen, logika változatlan. A `getMovablePositions`/`getValidMoves` eredményéből választ egyenletesen, sosem tud illegális lépést adni.

- Érvényes lépést ad vissza a kezdőállásból.
- `null`-t ad vissza, ha a soron lévő játékosnak nincs lépésképes bábuja.

## `src/shared/games/dama/ai/heuristic.test.ts` (6 teszt) — ÚJ, Dáma-0d

`evaluateDamaState(state, forPlayer)` — a MEDIUM/HARD keresés levél-kiértékelő függvénye. Lásd [dama-0d-ai-specifikacio.md §4](../dama-0d-ai-specifikacio.md).

- A szimmetrikus kezdőállás pontosan 0-t ad mindkét oldalról, és a két oldal pontszáma mindig pontos ellentéte egymásnak (zéróösszegű).
- Anyagi fölényt jutalmaz; a KIRÁLY többet ér, mint a BÁBU.
- Előrehaladást jutalmaz (BÁBU a promóciós sor felé) — anyag és mobilitás azonos mellett izolálva tesztelve.
- Nagyobb mobilitást jutalmaz — anyag ÉS előrehaladás azonos mellett izolálva tesztelve (azonos sor, csak az oszlop tér el).

## `src/shared/games/dama/ai/search.test.ts` (7 teszt) — ÚJ, Dáma-0d

Minimax + alfa-béta metszés, rögzített mélységgel (`findBestMoveFixedDepth`, KÖZEPES) és iteratív mélyítéssel/időkorláttal (`findBestMoveIterative`, NEHÉZ). Lásd [dama-0d-ai-specifikacio.md §2-3/5-6](../dama-0d-ai-specifikacio.md).

- `null`-t ad vissza, ha a soron lévő játékosnak nincs lépésképes bábuja (mindkét függvénynél).
- Érvényes lépést ad vissza a kezdőállásból.
- 2 lépés mélyen ellátva elkerüli azt a lépést, ami után az ellenfél azonnal visszaüthetne — konkrét taktikai pozícióval tesztelve (a "biztonságos" és a "veszélyes" célmező pontosan az anyagi/mobilitási/előrehaladási tagokban egyenlő, csak a 2. lépés kimenetele tér el).
- `findBestMoveIterative` ugyanazt a biztonságos lépést találja meg, mint a rögzített mélységű keresés, bőkezű időkeretnél.
- Nagyon szűk (5ms) időkeretnél sem dob hibát, és a kezdőállásra is ad érvényes lépést — a `SearchTimeBudgetExceeded` belső megszakítás-mechanizmus (csomópont-számláló alapú, 500 csomópontonként ellenőrizve) helyesen szakítja meg egy túl mély/túl széles keresést.
- **Dáma-0d.2-ben talált hiba javításának tesztje**: a pontosan egyenlő pontszámú lépések közti választás VÉLETLENSZERŰ, nem mindig az elsőt tartja meg — `Math.random` mockolásával igazolva, egy mesterséges, 2 db pontosan egyenlő lépéssel rendelkező pozícióval. Lásd §13.1 (a KÖZEPES vs KÖZEPES determinisztikus holtpont gyökér-oka és javítása).

## `src/shared/games/dama/ai/strategy.test.ts` (5 teszt) — ÚJ, Dáma-0d

`chooseDamaAiAction(state, difficulty)` — a hot-seat ÉS online mód közös belépési pontja mindhárom nehézségi szinthez. Lásd [dama-0d-ai-specifikacio.md §1/§7](../dama-0d-ai-specifikacio.md).

- Minden nehézségi szinten érvényes lépést ad vissza a kezdőállásból.
- Minden nehézségi szinten `null`-t ad vissza, ha a soron lévő játékosnak nincs lépésképes bábuja.
- KÖZEPES és NEHÉZ egyaránt elkerüli az azonnali visszaütést lehetővé tevő lépést; KÖNNYŰ-re (véletlenszerű) erre nincs garancia.
- **Csak-AI füst-teszt** (20s időkorláttal, HARD valós keresési ideje miatt) — 60 lépésig vegyesen mindhárom nehézséggel, dobás nélkül fut.
