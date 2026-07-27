# Ramses — tesztek

Futtatás: `npm run test:ramses` (53 teszt, 6 fájl). Lásd [README.md](./README.md) az általános konvenciókért. A multiplayer réteg (Ramses-0b) és az AI (Ramses-0c) réteg-áthidaló ellenőrzését (séma-kódolás, valós élő Colyseus szinkron, a rejtett-infó maszkolás biztonsági tulajdonsága a szervernél és a kliens-oldali `MaskedRamsesTransport`-nál) nem vitest fedi, hanem önálló smoke teszt scriptek — lásd `docs/ramses-0b-specifikacio.md` §6 és `docs/ramses-0c-ai-specifikacio.md` §7.

## `src/shared/games/ramses/engine/rules.test.ts` (19 teszt)

A tiszta predikátumok és a kör-váltás/pontszámítás segédfüggvényei.

- **`getAdjacentCellIds`** (2 teszt) — csak fel/le/jobb/bal szomszédok, nincs átlós; a tábla szélén levágva.
- **`canSlidePyramid`** (4 teszt) — csak az üres mezővel szomszédos, piramissal fedett cella csúsztatható; maga az üres mező nem; véget ért játékban semmi.
- **`nextPlayerIndex`** (1 teszt) — körbefordul az utolsó játékos után.
- **`scoreOf` / `computeWinnerIds`** (4 teszt) — pontösszegzés; egyértelmű vezető nyer; egyenlő pont esetén a több lap dönt; ha ez is egyenlő, MINDEN érintett nyer (holtverseny).
- **`renamePlayer`** (1 teszt) — csak a megadott azonosítójú játékos nevét cseréli, a többit érintetlenül hagyja (Ramses-0b: online módban a valós megjelenítendő név csak csatlakozáskor derül ki).
- **`toPublicRamsesState`** (3 teszt) — a hálózatra menő állapot maszkolása (Ramses-0b): egy még lefedett cella kincse `null`-ra vált, egy már felfedett cellájé nem; a húzópakli tartalma darabszám-egyező, de tartalom nélküli helyettesítőkre cserélődik; minden más mező (aktív lap, játékosok, kör, státusz) változatlan marad.
- **`awardActiveCardToCurrentPlayer`** (2 teszt) — a lap a soron lévő játékos gyűjteményébe kerül; ha ez volt az utolsó lap, a játék véget ér és a győztes(ek) kiszámolódnak.
- **`drawCardForCurrentPlayer`** (2 teszt) — új cél-lap húzása; "szerencsés eset": ha a húzott lap kincse épp az üres mezőn látszik, azonnali, lépés nélküli nyerés, majd újabb húzás ugyanannak a játékosnak.

## `src/shared/games/ramses/engine/reducer.test.ts` (7 teszt)

A `(state, action) → newState` reducer maga — egyetlen action-típus, `SLIDE_PYRAMID`.

- Érvénytelen (nem szomszédos) cellára csúsztatás no-op (ugyanaz a state-referencia); véget ért játékban is no-op.
- Üres mező felfedése: az üres hely arrébb kerül, a kör folytatódik, ugyanaz az `activeCard`.
- Rossz kincs felfedése: a kör átadódik a következő játékosnak, az `activeCard` VÁLTOZATLAN marad (házi szabály, lásd `docs/ramses-0a-specifikacio.md` §2.3).
- Jó kincs felfedése: a lap a soron lévő játékos gyűjteményébe kerül, **Ő MARAD** a soron lévő (nem a következő játékos!), és automatikusan húz egy új lapot.
- Az utolsó lap megnyerése lezárja a játékot és kiszámolja a győztes(eke)t.
- Üres mezők láncolata tetszőlegesen sokáig folytatja ugyanannak a játékosnak a körét.

## `src/shared/games/ramses/engine/selectors.test.ts` (6 teszt)

A UI-nak szánt, levezetett nézetek.

- `getCurrentPlayer` a `currentPlayerIndex`-nek megfelelő játékost adja.
- `getSlidableCellIds` csak a ténylegesen csúsztatható (piramissal fedett, szomszédos) cellákat listázza; véget ért játékban üres.
- `getScoreboard` pontszám szerint csökkenő sorrendben rendez.
- `getWinners` a `winnerIds`-t Player-objektumokká alakítja.
- `getDrawPileCount` a húzópakli hosszát adja vissza — biztonságosan használható online módban is, hiszen a maszkolt state húzópaklija is darabszám-helyes helyettesítőkből áll (sosem valódi lap-tartalomból).

## `src/shared/games/ramses/engine/initialState.test.ts` (4 teszt)

A véletlenszerű kezdő-felállás strukturális invariánsai (nem konkrét értékek, hiszen a tábla/pakli véletlenszerűen kevert).

- 48 cella, pontosan 12 különböző kincs + 36 üres pozíció.
- **Minden 2×2-es alrácsban (bal felső saroktól számítva, 3×4 = 12 alrács) pontosan 1 kincs van** — a kincs-elhelyezés generálási szabálya, lásd `docs/ramses-0a-specifikacio.md` §2.2.
- Pontosan egy piramis-nélküli cella, és annak biztosan nincs kincse (a kezdő-felállítás szabálya szerint).
- Játékosok a megadott nevekkel, üres gyűjteménnyel indulnak; pontosan egy lap kerül azonnal kihúzásra (a kezdő üres mező sosem "szerencsés", hiszen garantáltan üres).

## `src/shared/games/ramses/ai/memory.test.ts` (8 teszt)

Az AI reveal-memóriája (Ramses-0c) — lásd `docs/ramses-0c-ai-specifikacio.md` §3.

- **`observeRevealedState`** (4 teszt) — az üres mezőn éppen látszó kincset (vagy `null`-t üres esetén) jegyzi meg; egy későbbi hívás felülírja a korábbit ugyanarra a cellára; több cellára több hívás halmozódik.
- **`recall`** (4 teszt) — EASY-nél a felejtési arány 0, sosem "felejt"; `Math.random` mockolásával mindkét ág (felejt/nem felejt) determinisztikusan tesztelve; a felejtés SOSEM módosítja a mögöttes `Map`-et — egy "elfelejtett" cella később simán újra visszaidézhető.

## `src/shared/games/ramses/ai/strategy.test.ts` (10 teszt)

A döntéshozó (`chooseRamsesAiAction`) — lásd `docs/ramses-0c-ai-specifikacio.md` §3.3.

- Nem a soron lévő játékos szlotjára, illetve véget ért (nincs csúsztatható cella) játékra `null`-t ad.
- **EASY** (1 teszt) — a memóriát teljesen figyelmen kívül hagyja, még akkor is, ha az minden csúsztatható cellát rossznak jelöl.
- **MEDIUM** (2 teszt) — kerüli az ismerten rossz cellát, ha van más lehetőség; kényszerből ismert-rosszra csúsztat, ha minden csúsztatható cella ismerten rossz.
- **HARD** (4 teszt) — determinisztikus prioritási sorrend (a `Math.random` mockolásával a szimulált felejtés kikapcsolva): ismert győzelem > ismert üres > ismeretlen > kényszerű ismert-rossz, mindegyik szint egy-egy dedikált, pontosan egyelemű "helyes válasz" forgatókönyvön tesztelve.
- **"AI-only full game" smoke teszt** (1 teszt) — kevert-nehézségű (EASY/MEDIUM/HARD), csak-AI parti sok lépésen át fut hiba nélkül, sosem akad el akció nélkül (ugyanaz a filozófia, mint Hotel saját AI-only smoke tesztjénél: NEM várja el, hogy a parti a lépéskorláton belül `FINISHED`-be jusson — egy EASY-t is tartalmazó valós parti empirikusan ~15 000–20 000 csúsztatást igényelhet a 30 lapos pakli kimerítéséhez, ami egy korlátlan-farkú véletlen folyamat, nem garantálható felső korlát; a teszt lényege, hogy sok, változatos AI-döntés végig ne dobjon hibát).
