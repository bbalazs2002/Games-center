# Tesztek — áttekintés

Ez a mappa a projekt automatizált tesztjeinek (Vitest) dokumentációja — mit fed le melyik teszt-fájl, csoportosítva játékonként. Maga a teszt-futtatás mechanizmusa (Vitest) nem változott, csak a **futtatás kényelmesebb lett**: nem kell mindig az egész suite-ot lefuttatni, ha csak egy adott játékot érintő változtatást ellenőrzünk.

## Futtatás

| Parancs | Mit futtat |
|---|---|
| `npm run test` | **Minden** teszt (teljes suite) — ezt futtassuk le véglegesítés/PR előtt mindig. |
| `npm run test:dama` | Csak a Dáma-specifikus tesztek (`src/shared/games/dama`, `src/server/games/dama`). |
| `npm run test:hotel` | Csak a Hotel-specifikus tesztek (`src/shared/games/hotel`, `src/server/games/hotel`). |

**Miért ilyen egyszerű a megoldás?** A Vitest CLI-je natívan támogatja, hogy elérési út(ak)at adjunk meg paraméterként — csak azok a teszt-fájlok futnak le, amiknek az útvonala illeszkedik. Mivel a tesztek mappastruktúrája már eddig is játékonként szeparált volt (`src/shared/games/<game>/engine/*.test.ts`, `src/server/games/<game>/**/*.test.ts`), nem kellett hozzá semmilyen új konfiguráció (pl. Vitest workspace/projects) — csak egy-egy kényelmi `npm run` parancs játékonként.

**Új játék hozzáadásakor:** vedd fel az új `test:<game>` parancsot ugyanezzel a mintával a `package.json`-ban (`vitest run src/shared/games/<game> src/server/games/<game>`), és hozz létre egy `<game>-tesztek.md`-t ebben a mappában, ugyanolyan felépítéssel, mint a meglévők.

## Tartalom

- [dama-tesztek.md](./dama-tesztek.md) — Dáma motor + szerver-oldali AI tesztek
- [hotel-tesztek.md](./hotel-tesztek.md) — Hotel motor tesztek

## Konvenciók, amik minden játék tesztjeire érvényesek

- **`describe` blokkonként szerveződnek**, egy blokk egy motor-függvényt/action-típust/mechanikát fed le — ezek a dokumentumban lévő szakaszcímek is egyben (pontos `describe` szöveg, kereshető a teszt-fájlban).
- **A motor (reducer/rules), nem a UI ellenőrzése** — a `PlayerActionWheel`/React-komponensek nincsenek unit-tesztelve; élő böngészős ellenőrzés (Playwright) egészíti ki, ahol vizuális/interakciós kérdés merül fel (lásd a `hotel-0c-specifikacio.md`-ben leírt eseteket).
- **Determinisztikus bemenet** — a kocka-/dobás-értékek az action objektumban utaznak (a hívó generálja, pl. `Math.random()` a UI-ban), a reducer maga sosem hív véletlenszám-generátort — ez teszi lehetővé, hogy minden eset (GREEN/FREE/DOUBLE/RED, minden dobott szám stb.) explicit, reprodukálható teszt legyen.
