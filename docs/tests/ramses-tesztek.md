# Ramses — tesztek

Futtatás: `npm run test:ramses` (99 teszt, 6 fájl). Lásd [README.md](./README.md) az általános konvenciókért. A multiplayer réteg (Ramses-0b) és az AI (Ramses-0c) réteg-áthidaló ellenőrzését (séma-kódolás, valós élő Colyseus szinkron, a rejtett-infó maszkolás biztonsági tulajdonsága a szervernél és a kliens-oldali `MaskedRamsesTransport`-nál) nem vitest fedi, hanem önálló smoke teszt scriptek — lásd `docs/ramses-0b-specifikacio.md` §6 és `docs/ramses-0c-ai-specifikacio.md` §7. A `@colyseus/schema` `ArraySchema#splice()` üres→nem-üres korlátját (a Ramses-0d playtest-körben talált kritikus szinkron-hiba, lásd `docs/ramses-0a-specifikacio.md` §9.4) a game-agnosztikus `src/shared/core/colyseusSyncHelpers.test.ts` fedi, valódi `ArraySchema`-val.

## `src/shared/games/ramses/engine/rules.test.ts` (33 teszt)

A tiszta predikátumok és a kör-váltás/pontszámítás segédfüggvényei.

- **`getAdjacentCellIds`** (2 teszt) — csak fel/le/jobb/bal szomszédok, nincs átlós; a tábla szélén levágva.
- **`canSlidePyramid`** (6 teszt) — csak az üres mezővel szomszédos, piramissal fedett cella csúsztatható; maga az üres mező nem; véget ért játékban semmi; egy nevezési fázisban (Ajándék/Kockázat/Sivatagi póker) nem, ott előbb egy `NAME_*` action kell; egy speciális kártya saját csúsztatási fázisában viszont igen.
- **`nextPlayerIndex`** (2 teszt) — körbefordul az utolsó játékos után; kihagy egy közbeeső, feladott (`forfeited`) játékost (Ramses-0d).
- **`nextActivePlayerIndexAfter` / `activePlayerCount` / `canForfeit`** (3 teszt, Ramses-0d) — a köráthelyezés TETSZŐLEGES ülésről (nem csak `currentPlayerIndex`-ről) tud indulni, ami Sivatagi póker ideiglenes köráthelyezésekor szükséges; `activePlayerCount` kizárja a feladott játékosokat; `canForfeit` csak a normál `SEARCHING` fázisban igaz.
- **`scoreOf` / `computeWinnerIds`** (5 teszt) — pontösszegzés; egyértelmű vezető nyer; egyenlő pont esetén a több lap dönt; ha ez is egyenlő, MINDEN érintett nyer (holtverseny); egy feladott (`forfeited`) játékos SOSEM nyerhet, még a legmagasabb pontszámmal sem (Ramses-0d).
- **`renamePlayer`** (1 teszt) — csak a megadott azonosítójú játékos nevét cseréli, a többit érintetlenül hagyja (Ramses-0b: online módban a valós megjelenítendő név csak csatlakozáskor derül ki).
- **`toPublicRamsesState`** (4 teszt) — a hálózatra menő állapot maszkolása (Ramses-0b): egy még lefedett cella kincse `null`-ra vált, egy már felfedett cellájé nem; a Homokvihar-elforgatással KORRIGÁLT (effektív) treasureId kerül az üres mezőbe, nem annak saját, nyers értéke; a húzópakli tartalma darabszám-egyező, de tartalom nélküli helyettesítőkre cserélődik; minden más mező (aktív lap, játékosok, kör, státusz) változatlan marad.
- **`effectiveTreasureId`** (2 teszt) — forgatás nélkül a cella saját treasureId-ját adja; elforgatva a 180°-kal átellenes celláét (6×8 tábla: r,c → 5-r,7-c).
- **`isTreasureRevealed`** (3 teszt) — hamis, amíg a kincs cellája piramissal fedett; igaz, amint a (mindig EGYETLEN) üres mező épp az; forgatás esetén az átellenes cellán keresztül számol.
- **`getHiddenTreasureIds`** (2 teszt) — csak az épp az üres mezőn látszó EGY kincset zárja ki; forgatás nélküli/üres mezőnél semmit sem zár ki (a 12 kincsből legfeljebb 1 látszik egyszerre).
- **`canNameGiftTarget` / `canNameRiskTreasures` / `canNamePokerChallenge`** (3 teszt) — a megfelelő `AWAITING_*` fázist és a cél(ok) még-rejtett voltát követelik meg; a Kockázat 2 KÜLÖNBÖZŐ kincset, a Sivatagi póker egy MÁSIK játékost.

## `src/shared/games/ramses/engine/reducer.test.ts` (30 teszt)

A `(state, action) → newState` reducer — `SLIDE_PYRAMID`, a 4 speciális kártya `NAME_*` action-jai, és `FORFEIT`.

- **`reducer — SLIDE_PYRAMID`** (7 teszt) — érvénytelen (nem szomszédos) cellára csúsztatás no-op (ugyanaz a state-referencia); véget ért játékban is no-op; üres mező felfedése folytatja a kört ugyanazzal az `activeCard`-dal; rossz kincs felfedése átadja a kört a `activeCard` változatlanul hagyásával (házi szabály, §2.3); jó kincs felfedése a soron lévőnél TARTJA a kört és új lapot húz; az utolsó lap megnyerése lezárja a játékot; üres mezők láncolata tetszőlegesen sokáig folytatja ugyanazt a kört.
- **`awardActiveCardToCurrentPlayer`** (2 teszt) — a lap a soron lévő gyűjteményébe kerül, `activeCard` törlődik; az utolsó lap esetén a játék lezárul és a győztes(ek) kiszámolódnak.
- **`drawCardForCurrentPlayer`** (3 teszt) — új cél-lap húzása; "szerencsés eset" (a húzott lap kincse épp az üres mezőn látszik) azonnali, lépés nélküli nyerést ad; a "szerencsés eset" ellenőrzése is tiszteletben tartja egy korábbi Homokvihar-elforgatást.
- **`drawCardForCurrentPlayer — Homokvihar (SANDSTORM)`** (2 teszt) — bekapcsolja `treasureLayerRotated`-ot, lezárja a húzó körét, húz a következő játékosnak; egy második Homokvihar visszaállítja az eredetit.
- **`drawCardForCurrentPlayer — Záró kártya (FINISH)`** (1 teszt) — azonnal lezárja a játékot, akárhány lap is maradt még a pakliban.
- **`reducer — Ajándék (GIFT)`** (2 teszt) — teljes siker-folyamat: célt nevez, rátalál, a legkisebb pontértékű egyező lapok átadódnak, a kör a DRAWER (nem a megtaláló) utáni játékoshoz kerül; egy rossz találat a következő játékosnak adja át az ajándékot, aki saját célt nevez.
- **`reducer — Kockázat (RISK)`** (2 teszt) — siker: mindkét megnevezett kincs sorban megtalálva, vak húzás a bal szomszédtól; kudarc: egy harmadik, idegen kincs felbukkanása esetén a drawer adja a legkisebb pontértékű lapját a bal szomszédnak.
- **`reducer — Sivatagi póker (POKER)`** (2 teszt) — siker: ideiglenesen a megnevezett játékos kapja a kört, majd a kör helyesen a DRAWER (nem a kereső) utáni játékoshoz tér vissza; kudarc: a drawer húz vakon a keresőtől.
- **`drawCardForCurrentPlayer / reducer — Fata Morgana`** (4 teszt) — ha a jobb szomszédnak nincs lapja, a húzás eldobódik, a kör NEM zárul le, azonnal jön a következő lap; egy lap kölcsönvétele a jobb szomszédtól valódi keresést indít; siker esetén a kölcsönvett lap véglegesen a drawer gyűjteményébe kerül; kudarc esetén pontosan az a lap adódik vissza a szomszédnak.
- **`reducer — FORFEIT`** (5 teszt, Ramses-0d) — no-op egy speciális kártya nevezési/döntési fázisában (sosem hagyja pendingSpecialEffect-ben a feladó játékost); no-op véget ért játékban; a soron lévő játékost feladottnak jelöli, megtartja a lapjait, és a kört (ugyanazzal az `activeCard` céllal) a következő AKTÍV játékosnak adja; egy közbeeső, már feladott játékost kihagy a köráthelyezéskor; ha a feladás után már csak egy aktív játékos marad, a játék azonnal véget ér, ő nyer — a pontszámától függetlenül.

## `src/shared/games/ramses/engine/selectors.test.ts` (6 teszt)

A UI-nak szánt, levezetett nézetek.

- `getCurrentPlayer` a `currentPlayerIndex`-nek megfelelő játékost adja.
- `getSlidableCellIds` csak a ténylegesen csúsztatható (piramissal fedett, szomszédos) cellákat listázza; véget ért játékban üres.
- `getScoreboard` pontszám szerint csökkenő sorrendben rendez.
- `getWinners` a `winnerIds`-t Player-objektumokká alakítja.
- `getDrawPileCount` a húzópakli hosszát adja vissza — biztonságosan használható online módban is, hiszen a maszkolt state húzópaklija is darabszám-helyes helyettesítőkből áll (sosem valódi lap-tartalomból).

## `src/shared/games/ramses/engine/initialState.test.ts` (6 teszt)

A véletlenszerű kezdő-felállás strukturális invariánsai (nem konkrét értékek, hiszen a tábla/pakli véletlenszerűen kevert), és a speciális kártyák ki/bekapcsolása (§8.3).

- 48 cella, pontosan 12 különböző kincs + 36 üres pozíció.
- **Minden 2×2-es alrácsban (bal felső saroktól számítva, 3×4 = 12 alrács) pontosan 1 kincs van** — a kincs-elhelyezés generálási szabálya, lásd `docs/ramses-0a-specifikacio.md` §2.2.
- Pontosan egy piramis-nélküli cella, és annak biztosan nincs kincse (a kezdő-felállítás szabálya szerint).
- Játékosok a megadott nevekkel, üres gyűjteménnyel indulnak; pontosan egy lap kerül azonnal kihúzásra (a kezdő üres mező sosem "szerencsés", hiszen garantáltan üres).
- Alapértelmezetten mind a 12 speciális kártya benne van a pakliban (11 a 2-es, Záró a 3-as paklban), egyik sem válik közvetlenül `activeCard`-dá.
- `includeSpecialCards: false` esetén az eredeti, 36 lapos, speciális kártya nélküli paklit adja.

## `src/shared/games/ramses/ai/memory.test.ts` (12 teszt)

Az AI reveal-memóriája (Ramses-0c), és a Ramses-0d-ben bevezetett, EASY nehézséghez tartozó rövidtávú (bounded recent-window) változata, `recallEasy`.

- **`observeRevealedState`** (4 teszt) — az üres mezőn éppen látszó kincset (vagy `null`-t üres esetén) jegyzi meg; egy későbbi hívás felülírja a korábbit ugyanarra a cellára; több cellára több hívás halmozódik.
- **`recall`** (4 teszt) — EASY-nél a felejtési arány 0, sosem "felejt"; `Math.random` mockolásával mindkét ág (felejt/nem felejt) determinisztikusan tesztelve; a felejtés SOSEM módosítja a mögöttes `Map`-et — egy "elfelejtett" cella később simán újra visszaidézhető.
- **`recallEasy`** (4 teszt, Ramses-0d) — egy sosem megfigyelt cellára `undefined`; egy ÉPP MOST megfigyelt cellát visszaad; a korlátozott "friss" ablakon kívül eső cellát "elfelejt"; egy már ismert cella újra-megfigyelése frissíti a helyét az ablakban, nem duplázza.

## `src/shared/games/ramses/ai/strategy.test.ts` (12 teszt)

A döntéshozó (`chooseRamsesAiAction`) — lásd `docs/ramses-0c-ai-specifikacio.md` §3.3, a Ramses-0d-s BFS-útkeresés (`findKnownPathToTarget`) és anti-oszcilláció (`justVacatedCellId`) is ide tartozik (a HARD/MEDIUM szintbe épülve, közvetetten fedve az alábbi HARD/MEDIUM tesztek által).

- Nem a soron lévő játékos szlotjára, illetve véget ért (nincs csúsztatható cella) játékra `null`-t ad.
- **EASY** (3 teszt) — a TELJES memóriát figyelmen kívül hagyja (nem kerüli az ismert-rossz cellát); a rövidtávú `recallEasy`-ablakon belüli nyilvánvaló győzelmet felismeri és rááll; a friss ablakon belüli ismert-rossz cellát viszont NEM kerüli (MEDIUM/HARD-tól eltérően — csak győzelmet ismer fel, veszélyt nem).
- **MEDIUM** (2 teszt) — kerüli az ismerten rossz cellát, ha van más lehetőség; kényszerből ismert-rosszra csúsztat, ha minden csúsztatható cella ismerten rossz.
- **HARD** (4 teszt) — determinisztikus prioritási sorrend (a `Math.random` mockolásával a szimulált felejtés kikapcsolva): ismert győzelem > ismert üres > ismeretlen > kényszerű ismert-rossz, mindegyik szint egy-egy dedikált, pontosan egyelemű "helyes válasz" forgatókönyvön tesztelve.
- **"AI-only full game" smoke teszt** (1 teszt) — kevert-nehézségű (EASY/MEDIUM/HARD), csak-AI parti sok lépésen át fut hiba nélkül, sosem akad el akció nélkül (ugyanaz a filozófia, mint Hotel saját AI-only smoke tesztjénél: NEM várja el, hogy a parti a lépéskorláton belül `FINISHED`-be jusson — egy EASY-t is tartalmazó valós parti empirikusan ~15 000–20 000 csúsztatást igényelhet a 30 lapos pakli kimerítéséhez, ami egy korlátlan-farkú véletlen folyamat, nem garantálható felső korlát; a teszt lényege, hogy sok, változatos AI-döntés végig ne dobjon hibát).
