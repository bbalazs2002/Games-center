# Társasjáték Digitalizáló Platform — Projekt Koncepció

**Státusz:** Fázis 0a/0b/0c (Dáma) implementálva és élesben ellenőrizve; Fázis 2 Hotel-0a (helyi vertikum) és Hotel-0b (multiplayer) implementálva és lezárva; Hotel-0c.1 (assetek, UI-arculat) kész — legutóbb: napló-vezérelt animáció-rendszer (bábu-mozgás, pénzmozgás, építés/kert, telek-vásárlás), lásd [hotel-animacio-specifikacio.md](./hotel-animacio-specifikacio.md)
**Utolsó frissítés:** 2026-07-26

## Projekt célja

Fizikailag meglévő, kedvelt társasjátékok digitalizálása egy közös platformon belül, ahol:
- Minden játéknak szép, igényes grafikai megjelenése van
- Online multiplayer módban is játszhatók
- Teljesen cross-platform (böngésző, mobil, desktop)
- Játékonként külön letölthetők/törölhetők (moduláris letöltéskezelés), hogy ne foglaljanak feleslegesen helyet

**Szerepkör:** A projekt tulajdonosa (te) software architect és project manager szerepben dolgozik — tervezés, döntéshozatal, review. A kódolást és implementációt Claude végzi.

## Fejlesztési konvenciók / workflow

- **Verziókezelés:** a kód GitHub-ra kerül; helyi git repo már inicializálva (`git init` megtörtént 2026-07-22-én).
- **Mappastruktúra (gyökér):**
  - `src/` — a forráskód
  - `docs/` — tervezési dokumentumok és diagramok (ez a fájl is itt van); a `docs/tests/` almappa a teszt-suite dokumentációja, játékonkénti bontásban (lásd `docs/tests/README.md`)
  - `temp/` — átmeneti fájlok: ide kerülnek a Claude által generált, még átnézésre váró fájlok, valamint a felhasználó által Claude-nak adott bemeneti fájlok (debug infó, instrukciók stb.); nem verziózott tartalom (`.gitignore`-ban kizárva)
  - `.git/` — GitHub-integráció
  - további elemek várhatók a gyökérben a projekt előrehaladtával
- **Diagramok:** PlantUML használandó minden tervezési diagramhoz (`docs/` alá kerülnek).
- **Kódminőségi elvek:** SOLID alapelvek és Clean Code gyakorlatok követése kötelező az implementáció során.
- **Komment-nyelv (2026-07-23):** a kódban (src/, prisma/, konfigurációs fájlok) kizárólag angol nyelvű kommentek szerepelhetnek — ez professzionálisabb, és a kód esetleges nyílt forráskódúvá tétele esetén is releváns. A felhasználó felé megjelenő UI-szövegek (gombok, üzenetek, hibaszövegek) továbbra is magyarul maradnak, csak a fejlesztői kommentek angolok. A dokumentáció (`docs/*.md`) is marad magyar.
- **Munkafolyamat:** implementáció előtt gondos tervezés — specifikáció és diagramok készülnek, mielőtt kód íródik. Nem megyünk bele kódolásba tervezési dokumentáció nélkül egy adott feature/modul esetén.

## Játéklista (kiindulás)

Hotel, Gazdálkodj okosan, Bang, Hanabi, Sakk, Malom, Dáma, Connect 4 (4 in a row), Színözön (Mastermind), Catan telepesei (kiegészítőkkel), Gwent (Witcher 3 verzió), Monopoly, Cluedo, Aqua Romana, Activity, Tabu, King Arthur, Jungle Speed, Dobble, Snapszer, Römi, Mocsár, Holland kocsma, Star Trek Fleet Captains, Ramses II (bővíthető lista)

---

## 1. Technológiai keretrendszer

### Döntés: webes stack (game engine helyett)

**Válasz technológiák:**
- Frontend: React + TypeScript
- Backend / multiplayer: Node.js, WebSocket-alapú real-time sync (pl. Colyseus framework mérlegelése)
- 3D rendering: Three.js + React Three Fiber (R3F)
- 2D rendering: SVG / Canvas
- Letöltéskezelés: code-splitting (dynamic `import()`) + Service Worker cache, PWA telepíthetőség
- Későbbi natív store build opció: Capacitor vagy Tauri (ugyanabból a kódbázisból)

**Miért nem Unity/Unreal:**
- Unity/Unreal munka jelentős része editor-vezérelt (scene-összeállítás, drag-and-drop), ami nehezen illeszkedik "AI kódolja, ember review-olja" munkafolyamathoz
- Unreal 5 túlméretezett egy társasjáték-platformhoz (build méret, native pipeline overhead)
- Cross-platform natív build-ek (code signing, store review) jelentős extra terhet jelentenek szóló fejlesztőnél

**Miért web:**
- A legtöbb listázott játék 2D-ben is kiválóan megjeleníthető (SVG/Canvas), motoros overkill nélkül
- Cross-platform "beépítetten": egy böngésző-kompatibilis kódbázis fut mindenhol, PWA-ként telepíthető
- Moduláris letöltés natívan támogatott (dynamic import + SW cache) — nem kell külön download manager komponens
- Ez az a stack, amiben AI-asszisztált fejlesztés (tiszta, verziózható, review-olható kód) a legerősebb

**Alternatíva mérlegelésre:** Godot — nyílt forráskódú, git-barát `.tscn` fájlok, natív export minden platformra webig, kevésbé editor-vezérelt mint Unity, de meredekebb tanulási görbe. Külön megbeszélés tárgya lehet, ha a natív store jelenlét fontosabbá válik.

### 3D képesség web-en

- WebGL / WebGPU natívan biztosítja a GPU-gyorsított 3D rendert, natív motorokkal egyenértékű vizuális minőséggel
- Three.js + React Three Fiber: deklaratív, React-komponensként illeszkedő 3D réteg, ugyanabban a kódbázisban mint a 2D
- Fizika-szimulációhoz (pl. kockadobás): cannon-es vagy rapier integrálható R3F-fel
- 3D modellek: glTF szabvány, beszerzési stratégia (**eldöntve**): hibrid — kész CC0/free asset store (Kenney.nl, Sketchfab) a generikus elemekhez (kockák, zsetonok, táblaalap), egyedi/AI-generált modellek a játék-specifikus ikonikus darabokhoz (pl. Monopoly házak, Catan hexek). A Fázis 0/1 fejlesztési és tesztelési szakaszban egyszerű geometriai primitívek (kocka, henger, gömb placeholder) használandók a végleges assetek helyett, hogy a build/pipeline korán tesztelhető legyen asset-függőség nélkül.
- Teljesítmény mobil böngészőben is megfelelő, ha az asset-ek optimalizáltak (társasjáték-léptékű jelenetek, nem nyílt világ)

**Architekturális elv:** a tábla-renderelő réteg cserélhető — külön 2D (SVG/Canvas) és 3D (R3F) "board renderer" implementáció, játékonként kiválasztva. A játéklogika (state, szabályok, hálózati sync) teljesen független a megjelenítéstől.

**Kiegészítő elv (2026-07-22):** a játéklogika (core engine) emellett a *bemenet forrásától* is független — tiszta `(state, action) → new state` reducer, ami nem tudja, hogy az action helyi kattintásból vagy hálózati üzenetből származik. Ez teszi lehetővé, hogy előbb helyi (single-player/hot-seat) módban épüljön fel egy játék, és a multiplayer réteg utólag, a reducer módosítása nélkül csatlakozzon rá (lásd `docs/fazis-0a-dama-specifikacio.md`, Transport absztrakció).

**Termékkövetelmény (2026-07-22):** hosszú távon minden játékban keverhető legyen ember és AI játékos (pl. 1 ember vs. 1 AI, vagy vegyes összeállítás). Ez architekturálisan egy `PlayerController` absztrakcióként jelenik meg minden játék motorja fölött (lásd `docs/fazis-0a-dama-specifikacio.md`, 6. szakasz) — Fázis 1-ben csak `HumanController` készül el, de az illesztési pont a kezdetektől adott.

**Döntés (2026-07-22, eldöntve):** mely játékok legyenek 3D-sek

- 2D/SVG: kártyajáték-klaszter (Snapszer, Römi, Mocsár, Holland kocsma, Bang stb.) és a party/reflex, deduction, kirakós jellegű játékok (Activity, Tabu, Dobble, Jungle Speed, Cluedo, Színözön, Connect 4)
- 3D biztos: Hotel, Gazdálkodj okosan, Monopoly, Catan (térbeli tábla-élmény hozzáadott értéket ad)
- Opcionális 3D (később mérlegelendő, nem blokkoló): Sakk, Malom, Dáma

---

## 2. Játékok csoportosítása (fejlesztési klaszterek)

Cél: közös motor-komponensek azonosítása, hogy az alapréteget egyszer építsük meg, utána játékspecifikus szabályokkal bővítsünk.

| Klaszter | Játékok | Közös komponensek |
|---|---|---|
| **A — Klasszikus kártyajátékok** | Snapszer, Römi, Mocsár, Holland kocsma, Bang | pakli/keverés, kéz-kezelés, húzó/dobó pakli, körvezérlés, ütés/lerakás logika; Bang esetén külön rejtett-szerep réteg (Sheriff/Deputy/Outlaw/Renegade) épül rá az alapmotorra |
| **B — Rácsos absztrakt stratégiai játékok** | Sakk, Dáma, Malom, Connect 4 | koordináta-rács, bábu-mozgatás/zseton-ejtés, lépésvalidáció, nincs rejtett infó; közös AI-ellenfél (minimax) lehetőség |
| **C — Gazdasági/dobókockás táblás játékok** | Hotel, Gazdálkodj okosan, Monopoly | pálya körbejárás, kockadobás, pénz/bank kezelés, ingatlan-tulajdon, kártyahúzás mezők |
| **D — Party/reflex játékok** | Activity, Tabu, Dobble, Jungle Speed | időzítő, gyors reakció, minimális tábla, real-time interakció fókusz |
| **E — Rejtett információs** | Hanabi, Ramses II | Közös mag: szerver-oldali "teljes igazság" állapot, amiből minden kliens csak a neki járó, részleges nézetet kapja — jó teszt a state-sync számára. Hanabinél ez a saját kéz nem-látható (kooperatív, aszimmetrikus info); Ramses II-nél a tábla 48 mezőjének rejtett tartalma (kincsek a piramisok alatt), ami játék közben fokozatosan, minden játékos számára egyformán tárul fel — versengő, nem kooperatív, és emellett egyedi mechanikákat is igényel (memória-elem, forgatható tábla, célkártyák), amik külön rétegként épülnek a közös "rejtett állapot" alapra, nem a teljes motorból származnak. |
| **F — Modern hobby társasjátékok** | Catan (kiegészítőkkel), King Arthur, Aqua Romana | hex/moduláris pálya, erőforrás-kezelés, kereskedés — komplexebb, moduláris pálya-builder szükséges. ⚠️ Multiplayer-integráció előtt lásd a "GameRoom mezőnkénti schema" emlékeztetőt lent. |
| **G — Egyedi komplex kártyajáték** | Gwent | A) klaszter kártyamotorjára épül, de bonyolultabb szabályrendszer (sorok, frakciók, képességek) |
| **H — Deduction/logikai játékok** | Cluedo, Színözön (Mastermind) | rejtett állapot + visszajelzés-alapú következtetési hurok (guess & feedback loop); Cluedo-nál vádemelés/rejtett kártyaelosztás, Színözönnél gép által generált rejtett szín-sorrend és találati visszajelzés |
| **I — Nagy komplexitású kampányos wargame** | Star Trek Fleet Captains | flotta-management, kampány, legösszetettebb — legvégére hagyandó. ⚠️ Multiplayer-integráció előtt lásd a "GameRoom mezőnkénti schema" emlékeztetőt lent. |

Minden játék besorolva — nincs függő tétel.

### Javasolt fejlesztési sorrend

**Döntés (2026-07-22):** a multiplayer réteg építését későbbre halasztjuk. Előbb egy tisztán helyi (single-player/hot-seat) vertikumot építünk fel, és csak utána csatlakoztatjuk rá a hálózati réteget. Ez csak akkor biztonságos, ha a játéklogika a kezdetektől **framework- és transport-agnosztikus reducer/state-machine** mintában készül (lásd `docs/fazis-0a-dama-specifikacio.md`) — így a helyi és a hálózati futtatás ugyanazt a motort használja, nincs újraírás.

1. **Fázis 0a – Local shell**: alkalmazás-váz, közös UI-kit (tábla-komponens, gomb/menü rendszer), moduláris betöltés (dynamic import) — **auth, lobby és online multiplayer nélkül**, csak helyi/hot-seat játékhoz szükséges minimum
2. **Fázis 1 – Proof of concept**: **Dáma**, teljes vertikum, tisztán helyi (hot-seat) módban — 2 fős, egyszerű szabály, nincs rejtett infó, jól teszteli a core engine / renderer szétválasztást
3. **Fázis 0b – Multiplayer réteg**: Colyseus-alapú szerver, lobby, fiók/auth, letöltéskezelő SW cache + PWA telepíthetőség; a Fázis 1-ben megépült Dáma motor hálózati Transport-adapterrel bővül (a reducer nem változik). **Terv és implementáció (lezárva, élesben ellenőrizve):** [fazis-0b-multiplayer-specifikacio.md](./fazis-0b-multiplayer-specifikacio.md) (2026-07-22, utolsó kiegészítés 2026-07-24) — meghívó-kód alapú auth, PostgreSQL+Prisma, `src/` átrendezése `shared`/`client`/`server` alá, valós idejű lobby, újracsatlakozás.
3b. **Fázis 0c – AI ellenfél**: szoba létrehozásakor választható Ember/AI ellenfél, szerver-oldali "virtuális kliens" AI (ugyanazon a validáció/reducer-csövön megy át, mint egy emberi lépés), szoba-jelszó és csatlakozási kérelem. **Terv és implementáció (lezárva, élesben ellenőrizve):** [fazis-0c-dama-ai-specifikacio.md](./fazis-0c-dama-ai-specifikacio.md) (2026-07-23).
4. **Fázis 2 (átsorolva, 2026-07-24) — Hotel, a C) klaszter első tagja.** A te döntésed alapján a Dáma után **nem** a soron következő legkisebb lépés (B/A klaszter bővítés) jön, hanem tudatosan a legnagyobb architekturális ugrás: a Hotel egyszerre igényel 3+ fős szobalogikát, 3D board renderert és (a state mérete miatt) a `GameRoom` mezőnkénti `@colyseus/schema`-ra váltását — ezekkel korán, egy alaposan letesztelt vertikumban érdemes megbirkózni, mielőtt sok játékra szétterítenénk a kockázatot. A korábbi Fázis 2/3 (B/A klaszter bővítés, Hanabi) **nem törölve, csak hátrébb sorolva** — lásd lent.
   - **Hotel-0a — helyi vertikum: IMPLEMENTÁLVA és LEZÁRVA (2026-07-24, a felhasználó élő böngészős tesztje nem talált több hibát).** Játékmotor (reducer/state, N-fős, pálya-bejárás/ingatlan-vásárlás/bérleti díj/árverés), 3D "loop-track" board renderer (Three.js/R3F, geometriai placeholder assetekkel), N-fős hot-seat mód (egy gépen körbeadva) — multiplayer és végleges assetek nélkül. Részletek: [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md) §9.
   - **Hotel-0b — multiplayer: IMPLEMENTÁLVA (2026-07-24), élő 3-kliens Colyseus/Postgres teszttel ellenőrizve.** `GameRoom` N-fős/action-tudatos validáció, per-mező `@colyseus/schema` szinkron, 300s reconnection, game-agnosztikus `useOnlineGameRoom` hook. Részletek: [hotel-0b-multiplayer-specifikacio.md](./hotel-0b-multiplayer-specifikacio.md).
   - **Hotel-0b — multiplayer réteg: IMPLEMENTÁLVA (2026-07-24), élő böngészős tesztre vár.** `GameRoom` negyedik generikus paraméterrel (`TColyseusState`) és `isActionAllowed(state, slot, action)` szerződéssel bővült (Dámánál viselkedés-azonos); teljes mezőnkénti `@colyseus/schema`-refaktor Hotelre (`HotelStateSchema`/`hotelStateCodec.ts` — statikus konfig-adat sosem megy a hálózaton, `log` `ArraySchema<string>`-ként); `DamaOnlineGamePage` ~250 sorából kiemelt, game-agnosztikus `useOnlineGameRoom` hook, `HotelOnlineGamePage` is erre épül; online UI nyílt információval, tárcsa csak saját körben aktív; reconnection-ablak 300s; game-agnosztikus `requestFullSync`/`fullSync`. Négy meglévő Dáma smoke teszt + egy új, élő 3-kliens Hotel smoke teszt mind zöld valódi szerver ellen — egy éles hibát is talált és javított (játékosnév sosem szinkronizálódott a placeholder után). Részletek: [hotel-0b-multiplayer-specifikacio.md §9](./hotel-0b-multiplayer-specifikacio.md).
   - **Hotel-0c — assets és textúrák:** a placeholder geometriai primitívek lecserélése a hibrid asset-stratégia szerint (kész CC0 elemek + egyedi/AI-generált ikonikus darabok, lásd fent).
   - **Hotel-0d — AI ellenfél:** a Fázis 0c-ben megépült szerver-oldali "virtuális kliens" AI-minta kiterjesztése Hotelre (N-fős szobában bármelyik/több slot lehet AI).
5. **Fázis 3 (korábbi Fázis 2, hátrébb sorolva)**: B) klaszter bővítés (Sakk, Malom) vagy A) klaszter (Snapszer, Römi, Mocsár, Holland kocsma, Bang)
6. **Fázis 4 (korábbi Fázis 3, hátrébb sorolva)**: Hanabi (rejtett infó teszt)
7. **Fázis 5**: C) klaszter maradék tagjai (Gazdálkodj okosan, Monopoly) — ezekhez a Hotel-en megépült 3D/N-fős/AI infrastruktúra nagyrészt újrafelhasználható lesz
8. **Fázis 6+**: D), F), G), H) klaszterek, végül I) (Star Trek Fleet Captains)

---

## Nyitott kérdések / következő lépések

- [x] Eldönteni, mely játékok legyenek kifejezetten 3D-sek — **2026-07-22:** 3D biztos: Hotel, Gazdálkodj okosan, Monopoly, Catan; opcionális később: Sakk, Malom, Dáma; minden más 2D
- [x] Bang és Négy szín kirakós (ténylegesen: Connect 4 + Színözön) besorolása klaszterbe — **2026-07-22:** Bang → A) klaszter + rejtett-szerep réteg; Connect 4 → B) klaszter; Színözön → H) klaszter
- [x] 3D asset-beszerzési stratégia — **2026-07-22:** hibrid (kész CC0 asset generikus elemekhez + egyedi/AI-generált ikonikus darabokhoz); Fázis 0/1-ben egyszerű geometriai placeholder assetek
- [x] Godot alternatíva mérlegelése — **2026-07-22:** elhalasztva véglegesen, csak akkor kerül elő újra, ha a natív store jelenlét kritikus szemponttá válik
- [x] Multiplayer szerver-architektúra alapdöntés — **2026-07-22:** Colyseus mellett döntöttünk (kész szoba/state-sync keretrendszer, sématalapú állapot-szinkronizáció)
- [x] Fázis 0 (shell) részletes architektúra-terve, valamint a Colyseus-alapú multiplayer szerver-architektúra részletes kidolgozása — **elkészült és implementálva**, lásd [fazis-0a-dama-specifikacio.md](./fazis-0a-dama-specifikacio.md) és [fazis-0b-multiplayer-specifikacio.md](./fazis-0b-multiplayer-specifikacio.md)
- [x] **A `GameRoom` mezőnkénti `@colyseus/schema`-ra váltása (eredetileg 2026-07-23-i emlékeztető) — Hotel-0b feladata, döntés megszületett 2026-07-24-én.** A jelenlegi Dáma-implementáció opaque JSON state-et küld (egyszerű, de nem hálózat-hatékony 3+ fős/nagy state-ű játékokhoz); Hotel-0b elvégzi a teljes mezőnkénti refaktort (`GameRoom` új negyedik generikus paramétert kap a Colyseus state-típusra). Részletek: [hotel-0b-multiplayer-specifikacio.md §6](./hotel-0b-multiplayer-specifikacio.md).
- [ ] Hotel pontos szabályai (pálya, kezdőtőke, bérleti díjak, részvény-mechanika stb.) — **2026-07-24:** egyelőre egy általánosan ismert Hotel-változatból indulunk (lásd [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md) "Feltételezett szabályváltozat" szakasza), pontosításra vár a ti konkrét példányotok alapján.

---

## Beszélgetés kontextusa

Ez a dokumentum az eddigi tervezési beszélgetés összefoglalója, folyamatosan frissítve. Állapot 2026-07-24: Fázis 0a/0b/0c (Dáma — helyi vertikum, multiplayer réteg, AI ellenfél) lezárva, implementálva, élesben ellenőrizve. Folyamatban: Fázis 2 (Hotel) — a fejlesztési sorrendben tudatosan előre hozva, mert a legnagyobb architekturális ugrást jelenti (3+ fő, 3D renderer, schema-refaktor), lásd a fejlesztési sorrend 4. pontját és [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md).