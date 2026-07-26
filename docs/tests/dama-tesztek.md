# Dáma — tesztek

Futtatás: `npm run test:dama` (24 teszt, 4 fájl). Lásd [README.md](./README.md) az általános konvenciókért.

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

## `src/server/games/dama/ai/randomMoveStrategy.test.ts` (2 teszt)

A Fázis 0c AI-ellenfél "szimulált input" stratégiája — `pickRandomMove` a `getMovablePositions`/`getValidMoves` eredményéből választ egyenletesen, sosem tud illegális lépést adni.

- Érvényes lépést ad vissza a kezdőállásból.
- `null`-t ad vissza, ha a soron lévő játékosnak nincs lépésképes bábuja.
